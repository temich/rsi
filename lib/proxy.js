var http = require('http'),
	url = require('url'),
	domain = require('domain'),
	async = require('async'),
	rsi = require('./rsi');

module.exports = function(cache, options, logger) {

	var logger = logger || console;

	//cache && typeof cache.flushall === 'function' && cache.flushall();

	function mirror(uri, res, callback) {
		return http.get(uri, function(r) {
			for (var name in r.headers) {
				res.setHeader(name, r.headers[name]);
			}

			res.writeHead(r.statusCode);
			r.pipe(res);

			typeof callback === 'function' && callback(r);
		});
	}

	return function(req, res) {

		var isResource = req.url.substr(0, 2) !== '/~', // not static resources start with '/~'
			uri =  (isResource) ? url.parse('http://' + req.url) : url.parse('http://' + req.url.replace('/~', '')),
			reqd = domain.create(),
			startTime = new Date().getTime();

		if (isResource) {
			reqd.run(function(){
				cache.get(req.url, function(err, value) {
					if (err || value === null) {
						res.writeHead(404);
						res.write('File not found ' + req.url);
						res.end();

						logger.warn('File not found ' + req.url);
						return;
					}

					reqd.add(mirror(value, res));
				});
			});
		} else {
			reqd.add(mirror(url.format(uri), res, function(r) {

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