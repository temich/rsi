var http = require('http'),
	url = require('url'),
	async = require('async'),
	rsi = require('./rsi');

module.exports = function(cache, options) {
	return function(req, res) {
		var uri = url.parse('http:' + req.url); // No SSL support

		/*
		 URIs not started with // should be cached static files served by nginx
		 */
		if (!uri.host || req.url.substr(0, 2) !== '//') {
			res.writeHead(404);
			res.write('Bad url ' + req.url);
			res.end();

			return;
		}

		http.get({
			hostname: uri.host,
			path: uri.path
		}, function(r) {
			for (var name in r.headers) {
				res.setHeader(name, r.headers[name]);
			}

			res.writeHead(r.statusCode);
			r.pipe(res);

			var id = rsi.identify(r, uri, cache, options);

			if (r.headers['content-type'].match(/^(?:text\/|application\/json)/)) {
				rsi.scan(req, r, uri, cache, options, function(entagled) {
					entagled
						? id.dispose()
						: id.persist();
				});
			} else {
				id.persist();
			}
		});
	}
};