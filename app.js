// app.js

const app = express();
app.use(bodyParser.json());

app.use((req, res, next) => {
    req.db = db;
    next();
});

module.exports = app;
