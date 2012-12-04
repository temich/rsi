var http = require('http'),
	url = require('url'),
	domain = require('domain'),
	async = require('async'),
	rsi = require('./rsi');

function proxy(uri, res, callback) {
	return http.get(uri, function(r) {
		for (var name in r.headers) {
			res.setHeader(name, r.headers[name]);
		}

		res.writeHead(r.statusCode);
		r.pipe(res);

		typeof callback === 'function' && callback(r);
	});
}

module.exports = function(cache, options, logger) {

	logger || (logger = console);

	return function(req, res) {
		var reqd = domain.create(),
			timestamp = new Date().getTime();

		if (req.url.substr(0, 2) !== '/~') {
			reqd.run(function(){
				cache.get(req.url, reqd.intercept(function(value) {
					if (value === null) {
						res.writeHead(404);
						res.write('Key not found ' + req.url);
						res.end();

						logger.warn('Key not found ' + req.url);
						return;
					}

					logger.info('Found key ' + value);

					reqd.add(proxy(value, res));
				}));
			});
		} else {
			var uri = url.parse('http://' + req.url.substr(2)); // remove /~

			reqd.add(proxy(url.format(uri), res, function(r) {
				var id = rsi.identify(r, uri, cache, options, logger);

				if (r.headers['content-type'].match(/^(?:text\/|application\/json)/)) {
					rsi.scan(req, r, uri, cache, options, logger, function(entangled) {
						entangled
							? id.dispose()
							: id.persist();
					});
				} else {
					id.persist();
				}

				logger.info('Processed: http://%s%s in %s ms.', uri.host, uri.path, (+new Date() - timestamp));
			}));
		}

		reqd.on('error', function(e) {
			logger.error('Proxy error:', e);

			res.writeHead(502);
			res.end();

			reqd.dispose();
		});



	}
};