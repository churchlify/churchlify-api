// logger/logger.js
const { createLogger, format, transports } = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const InfluxTransport = require('./influxLogger');

const loggerTransports = [
  new transports.Console(),

  new DailyRotateFile({
    dirname: 'logs/app',
    filename: 'app-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    maxFiles: '30d',
    zippedArchive: true
  })
];

// 🔥 Conditionally enable Influx logging
if (process.env.INFLUX_LOG_ENABLED === 'true') {
  loggerTransports.push(
    new InfluxTransport({
      url: process.env.INFLUX_URL,
      token: process.env.INFLUX_TOKEN,
      org: process.env.INFLUX_ORG,
      bucket: 'api_logs',
      measurement: 'app_logs'
    })
  );
}

const logger = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.json()),
  transports: loggerTransports
});

module.exports = logger;
