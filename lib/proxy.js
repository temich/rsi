var http = require('http'),
	url = require('url'),
	domain = require('domain'),
	async = require('async'),
	rsi = require('./rsi');

module.exports = function(cache, options, logger) {

	var logger = logger || console;

	cache && typeof cache.flushall === 'function' && cache.flushall();

	return function(req, res) {
		var uri = url.parse('http:' + req.url); // No SSL support

		/*
		 URIs not started with // should be cached static files served by nginx
		 */
		if (!uri.host || req.url.substr(0, 2) !== '//') {
			res.writeHead(404);
			res.write('Bad url ' + req.url);
			res.end();

			logger.info('Bad url ' + req.url);
			return;
		}

		var reqd = domain.create(),
			startTime = new Date().getTime();

		reqd.run(function() {
			var req = http.get({
				hostname: uri.host,
				path: uri.path,
				method: 'GET'
			}, function(r) {
				for (var name in r.headers) {
					res.setHeader(name, r.headers[name]);
				}

				res.writeHead(r.statusCode);
				r.pipe(res);

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

				logger.info('Finished processing uri: http://%s%s in time %s ms.', uri.host, uri.path, (new Date().getTime() - startTime));
			});

			reqd.add(req);
		});

		reqd.on('error', function(e) {
			logger.error('Proxy error:', e);

			res.writeHead(502);
			res.end();

			reqd.dispose();
		});
	}
};