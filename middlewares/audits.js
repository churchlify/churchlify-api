const AuditTrail = require('../models/audits');
const methodMappers = {
    'GET':'Fetching',
    'POST':'Adding',
    'PUT':'Updating',
    'PATCH':'Ppatching',
    'DELETE':'Deleting'
};

exports.logAuditTrails = (req, res, next) => {
    try {
        const originalJson = res.json;
        const safeHeaders = { ...req.headers };
        delete safeHeaders.authorization;
        const headersToLog = JSON.stringify(safeHeaders);
        let payloadToLog;
        
        const contentType = req.headers['content-type'];
        const isFileUpload = contentType && contentType.startsWith('multipart/form-data');
        
        if (isFileUpload || !req.body || Object.keys(req.body).length === 0) {
            payloadToLog = JSON.stringify({ status: 'Unparsed/File Body', size: req.headers['content-length'] });
        } else {
            payloadToLog = JSON.stringify(req.body);
        }

        res.json = async function (body) {
            try {
                const statusCode = res.statusCode;
                
                if (statusCode < 400) {
                    await AuditTrail.create({
                        url: req.originalUrl,
                        activity: methodMappers[req.method] + ' ' + req.originalUrl.split('/')[req.originalUrl.split('/').length - 1] || '',
                        params: JSON.stringify(req.params),
                        query: JSON.stringify(req.query),
                        payload: payloadToLog, 
                        headers: headersToLog,
                        response: JSON.stringify(body),
                        status: statusCode
                    });
                } else {
                     console.log(`Skipping detailed audit for error status: ${statusCode}`);
                }
            } catch (auditError) {
                console.error('Audit Trail Save FAILED:', auditError.message);
            }
            return originalJson.call(this, body);
        };     
        next();
    } catch (error) {
        console.error('>>>>> An error occurred setting up audit middleware: >>>>>>>>', error.message);
        next(); // CRITICAL: Ensure execution continues
    }
};