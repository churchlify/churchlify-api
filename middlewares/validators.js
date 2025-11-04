const { body, validationResult, check } = require('express-validator');
const mongoose = require('mongoose');
// const Church = require('../models/church');
// const User = require('../models/user');
// body('description').optional().i().withMessage('Description is required'),
const validateUser = () => [
    body('church').optional().notEmpty().withMessage('Please provide affiliated church'),
    body('adminAt').optional().notEmpty().withMessage('Please provide Admin\'s church'),
    body('firstName').notEmpty().withMessage('First Name is required'),
    body('lastName').notEmpty().withMessage('Last Name is required'),
    body('emailAddress').isEmail().withMessage('Email is invalid'),
    body('phoneNumber').matches(/^\+\d{10,15}$/).withMessage('Phone number is invalid'),
    body('address').notEmpty().withMessage('Address is required'),
    body('dateOfBirth').notEmpty().withMessage('Date of birth is Invalid'),
    body('gender').notEmpty().withMessage('Gender is required'),
    body('anniversaryDate').optional().custom(value => typeof value === 'string').withMessage('Please provide anniversary date'),
    body('address.street').notEmpty().withMessage('Street address is required'),
    body('address.city').notEmpty().withMessage('City is required'),
    body('address.postalCode').notEmpty().withMessage('Postal code is required'),
    body('address.country').notEmpty().withMessage('Country is required'),
    body('address.state').notEmpty().withMessage('Province/State is required'),
    body('isChurchAdmin').optional().custom(value => typeof value === 'boolean').withMessage('Please provide admin role status'),
    body('isMarried').optional().custom(value => typeof value === 'boolean').withMessage('Please provide Marital status'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
];

const validateChurch = () => [
    body('name').notEmpty().withMessage('Name is required'),
    body('createdBy').notEmpty().withMessage('Please provide affiliated user'),
    body('shortName').notEmpty().withMessage('short Name is required'),
    body('timeZone').notEmpty().withMessage('Time Zone is required'),
    body('emailAddress').isEmail().withMessage('Email is invalid'),
    body('phoneNumber').isMobilePhone().withMessage('Phone number is invalid'),
    body('address.street').notEmpty().withMessage('Address is required'),
    body('address.city').notEmpty().withMessage('City is required'),
    body('address.postalCode').notEmpty().withMessage('Postal code is required'),
    body('address.country').notEmpty().withMessage('Country is required'),
    body('address.state').notEmpty().withMessage('Province/State is required'),
    body('isApproved').optional().toBoolean().custom(value => typeof value === 'boolean').withMessage('Approval status can only be true or false'),
    body('isPublished').optional().toBoolean().custom(value => typeof value === 'boolean').withMessage('Publish status can only be true or false'),

    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
];

const validateEvent = () => [
    body('church').notEmpty().withMessage('Church is required'),
    body('createdBy').notEmpty().withMessage('Invalid user or permission'),
    body('title').notEmpty().withMessage('Title is required'),
    body('startDate').isDate({format: 'YYYY-MM-DD'}).withMessage('Start Date must be date with YYYY-MM-DD format'),
    body('startTime').custom((value) => {
        if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(value)) { throw new Error('Value must be time with HH:MM format');}
        return true;}).withMessage('Start time is invalid'),
    body('endDate').isDate({format: 'YYYY-MM-DD'}).withMessage('End Date must be date with YYYY-MM-DD format'),
    body('endTime').custom((value) => {
        if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(value)) { throw new Error('Value must be time with HH:MM format');}
        return true;}).withMessage('End time is invalid'),
    body('reminder').optional().notEmpty().withMessage('Reminder cannot be empty'),
    body('recurrence.frequency').optional().notEmpty().withMessage('Reminder cannot be empty'),
    body('recurrence.interval').optional().isNumeric().withMessage('Interval cannot be empty'),
    body('recurrence.daysOfWeek').optional().isNumeric().withMessage('Invalid recurrence day'),
    body('recurrence.endRecurrence').optional().isDate().withMessage('Invalid recurrence end date'),

    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
];

const validateKid = () => [
    body('parent').notEmpty().withMessage('Please provide affiliated parent'),
    body('firstName').notEmpty().withMessage('First Name is required'),
    body('lastName').notEmpty().withMessage('Last Name is required'),
    body('dateOfBirth').notEmpty().withMessage('Date of birth is Invalid'),
    body('gender').notEmpty().withMessage('Gender is required'),
    body('middleName').optional().custom(value => value.length > 3).withMessage('Please provide a vallid middle name'),
    body('allergies').optional().custom(value => Array.isArray(value)).withMessage('Allergies must be array of string'),
    (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
        next();
    }
];

const validateMinistry = () => [
    body('church').custom((value) => mongoose.Types.ObjectId.isValid(value)).withMessage('Please provide a valid affiliated church ID'),
    body('leaderId').optional().custom((value) => mongoose.Types.ObjectId.isValid(value)).withMessage('Please provide a valid leader ID'),
    body('name').notEmpty().withMessage('Name is required'),
    body('description').optional().notEmpty().withMessage('Description cannot be empty'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
];

const validateNotification = () => [
    body('recipients').notEmpty().withMessage('Recipients is required'),
    body('author').custom((value) => mongoose.Types.ObjectId.isValid(value)).withMessage('Please provide a valid User ID'),
    body('type').notEmpty().withMessage('Notification type is required'),
    body('provider').notEmpty().withMessage('Notification provider is required'),
    body('content.body').notEmpty().withMessage('Notification Body is required'),
    body('content.subject').notEmpty().withMessage('Subject / Body is required'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
];

const validateDevotion = () => [
    body('church').custom((value) => mongoose.Types.ObjectId.isValid(value)).withMessage('Please provide a valid affiliated church ID'),
    body('author').optional().custom((value) => mongoose.Types.ObjectId.isValid(value)).withMessage('Please provide a valid author ID'),
    body('title').notEmpty().withMessage('Title is required'),
    body('scripture').notEmpty().withMessage('Scripture is required'),
    body('content').notEmpty().withMessage('Content is required'),
    body('date').notEmpty().withMessage('Devotion date is required'),
    body('tags').optional().notEmpty().withMessage('tags cannot be empty'),
    body('isPublished').optional().isBoolean().withMessage('isPublished must be boolean'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
];

const validatePrayer = () => [
    body('church').custom((value) => mongoose.Types.ObjectId.isValid(value)).withMessage('Please provide a valid affiliated church ID'),
    body('author').custom((value) => mongoose.Types.ObjectId.isValid(value)).withMessage('Please provide a valid author ID'),
    body('title').notEmpty().withMessage('Title is required'),
    body('anonymous').optional().isBoolean().withMessage('anonymous must be boolean'),
    body('isPublic').optional().isBoolean().withMessage('isPublic must be boolean'),
    body('prayerRequest').notEmpty().withMessage('prayerRequest is required'),
    body('urgency').optional().notEmpty().withMessage('urgency cannot be empty'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
];

const validateTestimony = () => [
    body('church').custom((value) => mongoose.Types.ObjectId.isValid(value)).withMessage('Please provide a valid affiliated church ID'),
    body('author').custom((value) => mongoose.Types.ObjectId.isValid(value)).withMessage('Please provide a valid author ID'),
    body('title').notEmpty().withMessage('Title is required'),
    body('anonymous').optional().isBoolean().withMessage('anonymous must be boolean'),
    body('isPublic').optional().isBoolean().withMessage('isPublic must be boolean'),
    body('story').notEmpty().withMessage('story is required'),
    body('impact').optional().notEmpty().withMessage('impact cannot be empty'),
    body('gratitude').optional().notEmpty().withMessage('gratitude cannot be empty'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
];

const validateFellowship = () => [
    body('church').isMongoId().withMessage('Please provide affiliated church ID'),
    body('name').notEmpty().withMessage('Name is required'),
    body('address.street').notEmpty().withMessage('Address is required'),
    body('address.city').notEmpty().withMessage('City is required'),
    body('address.postalCode').notEmpty().withMessage('Postal code is required'),
    body('address.country').notEmpty().withMessage('Country is required'),
    body('address.state').notEmpty().withMessage('Province/State is required'),
    body('dayOfWeek').optional().notEmpty().withMessage('Location cannot be empty'),
    body('meetingTime').optional().notEmpty().withMessage('Location cannot be empty'),
    body('leaderId').optional().isMongoId().withMessage('Please provide a valid ID'),
    body('description').optional().notEmpty().withMessage('Description cannot be empty'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
];

const validateSubscription = () => [
    body('church').notEmpty().withMessage('Church ID is required').custom((value) => {
            if (!mongoose.Types.ObjectId.isValid(value)) {
                throw new Error('Invalid Church ID');
            }
            return true;
    }),
    body('modules').isArray().withMessage('Modules must be an array')
        .notEmpty().withMessage('At least one module is required').custom((value) => {
            if (!value.every(id => mongoose.Types.ObjectId.isValid(id))) {
                throw new Error('One or more module IDs are invalid');
            }
            return true;
    }),
    body('startDate').optional().isISO8601().withMessage('Invalid start date format').toDate(),
    body('expiryDate') .notEmpty().withMessage('Expiry date is required').isISO8601().withMessage('Invalid expiry date format').toDate(),
    body('status').optional().isIn(['active', 'expired', 'cancelled', 'pending']) .withMessage('Invalid subscription status'),
    body('payments').optional().isArray().withMessage('Payments must be an array') .custom((value) => {
            if (!value.every(id => mongoose.Types.ObjectId.isValid(id))) {
                throw new Error('One or more payment IDs are invalid');
            }
            return true;
        }),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
    ];

const validateModule = () =>  [
        body('name').trim().notEmpty().withMessage('Module name is required'),
        body('baseCost').isFloat({ min: 0 }).withMessage('Base cost must be a non-negative number'),
        body('description').optional().trim(),
        body('features').optional().isArray().withMessage('Features must be an array'),
        (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
    ];

const validatePayment = () =>  [
    body('user').notEmpty().withMessage('User ID is required').custom((value) => {
            if (!mongoose.Types.ObjectId.isValid(value)) {
                throw new Error('Invalid User ID');
            }
            return true;
        }),
    body('church').notEmpty().withMessage('Church ID is required').custom((value) => {
            if (!mongoose.Types.ObjectId.isValid(value)) {
                throw new Error('Invalid Church ID');
            }
            return true;
        }),
    body('subscription').notEmpty().withMessage('Subscription ID is required').custom((value) => {
            if (!mongoose.Types.ObjectId.isValid(value)) {
                throw new Error('Invalid Subscription ID');
            }
            return true;
        }),
    body('paymentId').trim().notEmpty().withMessage('Payment ID is required'),
    body('amount').isFloat({ min: 0 }).withMessage('Amount must be a non-negative number'),
    body('status').isIn(['pending', 'succeeded', 'failed', 'refunded']).withMessage('Invalid payment status'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
    ];

const validateSettings = () => [
        body('church').notEmpty().withMessage('Church ID is required').custom((value) => {
                if (!mongoose.Types.ObjectId.isValid(value)) {
                    throw new Error('Invalid Church ID');
                }
                return true;
            }),
        body('key').trim().notEmpty().withMessage('Setting key is required'),
        body('value').notEmpty().withMessage('Setting value is required'),
        (req, res, next) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }
            next();
        }
    ];
const validateAssignment = () => [
        body('userId').notEmpty().withMessage('User ID is required').custom((value) => {
                if (!mongoose.Types.ObjectId.isValid(value)) {
                    throw new Error('Invalid User ID');
                }
                return true;
            }),
        body('ministryId').optional().notEmpty().withMessage('Ministry ID is required').custom((value) => {
            if (!mongoose.Types.ObjectId.isValid(value)) {
                throw new Error('Invalid Ministry ID');
            }
            return true;
        }),
        body('fellowshipId').optional().notEmpty().withMessage('Fellowship ID is required').custom((value) => {
            if (!mongoose.Types.ObjectId.isValid(value)) {
                throw new Error('Invalid Fellowship ID');
            }
            return true;
        }),
        body('dateAssigned').notEmpty().withMessage('Date Assigned is required').isISO8601().withMessage('Invalid date format').toDate(),
        (req, res, next) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }
            next();
        }
    ];

    const validateDonationItem = () =>  [
        body('title').isString().withMessage('Donation Title is required'),
        body('description').optional().notEmpty().withMessage('Please provide a valid description'),
        body('suggestedAmounts').optional().isArray().withMessage('Suggested amounts must be an array of numbers'),
        (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
    ];

const validateObjectId = () => [
    check('id').optional().isMongoId().withMessage('Invalid Object Id provided'),
    check('church').optional().isMongoId().withMessage('Invalid Object Id, provide valid church ID'),
    check('parent').optional().isMongoId().withMessage('Invalid Object Id, provide valid parent ID'),
    check('child').optional().isMongoId().withMessage('Invalid Object Id, provide valid child ID'),
];
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

module.exports = { validateChurch, validateUser, validateEvent, validateKid, validateObjectId, isValidObjectId,
    validatePrayer, validateTestimony, validateDevotion ,validateMinistry, validateFellowship, validateSubscription,
    validateModule, validatePayment, validateSettings, validateAssignment, validateDonationItem, validateNotification};