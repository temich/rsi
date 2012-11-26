var http = require('http'),
	url = require('url'),
	path = require('path'),
	async = require('async'),
	Stream = require('memorystream');

var re;

function findLinks(contents, uri, options) {
	var links = [],
		found = {},
		matches,
		link;

	while (matches = re.exec(contents)) {
		link = matches[1];

		var loc = url.resolve('//' + uri.host,  url.resolve(uri.pathname, link)),
			id = url.parse(url.resolve('http://', loc));

		// TODO: 'local' domain group
		if (id.host !== uri.host) {
			// omit external links
			console.log('omitted', id.href);
			continue;
		}

		if (options['ignore-extensions']
			&& options['ignore-extensions'].indexOf(path.extname(uri.pathname).toLowerCase()) !== -1) {

			continue;
		}

		if (!found[link]) {
			links.push(link);
			found[link] = true;
		}
	}

	return links;
}

/**
 * Reverse-requests list of resources for identification
 *
 * @param links {Array} List of URIs
 * @param req {http.ServerRequest} Current request
 * @param uri {Object} Original URI
 * @param cache {Object} Redis client
 */
function identify(links, req, uri, cache) {
	async.forEach(links, function(link, next) {
		var path = url.resolve('//' + uri.host,  url.resolve(uri.pathname, link));

		cache.get(path, function(err, value) {
			if (value === null) {
				var host = (req.headers || req._headers)['host']; // TODO: wtf

				console.log('warmup', host, path);
				request(host, path, next);
			}
		});
	});
}

function request(host, path, next) {
	var uri = 'http://' + host + path;

	http.get(uri, function(res) {
		if (Math.floor(res.statusCode/100) !== 2) {
			console.error('Referred resource not found', uri);
		}

		res.on('end', next);
	});
}

/**
 * Looks for local links and make reverse-request for identification of target resource
 *
 * @param req {http.ServerRequest}
 * @param res {http.ServerResponse}
 * @param uri {Object} Original URI
 * @param cache {Object} Redis client
 * @param options {Object} Configuration
 * @param next {function} Callback function. Entagled flag passed as argument.
 */
module.exports = function(req, res, uri, cache, options, next) {
	var stream = new Stream(null, { readable: false });

	res
		.pipe(stream)
		.on('end', function() {
			var content = stream.toString('utf-8'),
				links = findLinks(content, uri, options);

			identify(links, req, uri, cache);

			console.log(uri.href, links);
			next && next(!!links.length);
		});

	re = new RegExp(options['link-regex'], 'gi');
};
