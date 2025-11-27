// logger/influxTransport.js
const Transport = require('winston-transport');
const { InfluxDB, Point } = require('@influxdata/influxdb-client');

class InfluxTransport extends Transport {
  constructor(opts) {
    super(opts);

    this.writeApi = new InfluxDB({
      url: opts.url,
      token: opts.token
    }).getWriteApi(opts.org, opts.bucket, 'ns');

    this.defaultMeasurement = opts.measurement || 'app_logs';
  }

  log(info, callback) {
    setImmediate(() => this.emit('logged', info));

    const point = new Point(info.measurement || this.defaultMeasurement)
      .tag('level', info.level)
      .tag('method', info.method || '')
      .tag('url', info.url || '')
      .tag('status', info.status || '')
      .stringField('message', info.message);

    if (info.error) { point.stringField('error', info.error);}
    if (info.stack) { point.stringField('stack', info.stack);}

    this.writeApi.writePoint(point);
    this.writeApi.flush();

    callback();
  }
}

module.exports = InfluxTransport;
