var http = require('http'),
	url = require('url'),
	path = require('path'),
	async = require('async'),
	Stream = require('memorystream');

var re, logger;

function findLinks(contents, uri, options) {
	var links = [],
		found = {},
		matches,
		link;

	while (matches = re.exec(contents)) {
		link = matches[1];

		var loc = url.resolve('//' + uri.host,  url.resolve(uri.pathname, link)),
			id = url.parse(url.resolve('http://', loc)),
			ext = path.extname(id.pathname).toLowerCase(),
			isDifferentDomains = (id.host !== uri.host),
			isLocalDomain = options['local-domains'] && options['local-domains'].indexOf(id.host) !== -1;

		if (isDifferentDomains && !isLocalDomain) {
			// omit external links
			logger.info('Ignore external file: %s', loc);
			continue;
		}

		if (!ext
			|| options['ignore-extensions']
			&& options['ignore-extensions'].indexOf(ext) !== -1) {

			logger.info('Ignore file with "ignore-extensions": %s', loc);
			continue;
		}

		if (!found[link]) {
			links.push(link);
			found[link] = true;

			logger.info('Link %s added to processing list ', link);
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

		logger.info('Get resources from cache by path: %s', path);

		cache.get(path, function(err, value) {
			if (value === null) {
				var host = (req.headers || req._headers)['host']; // TODO: wtf

				logger.info('Warmup', host, path);
				request(host, path, next);
			}
		});
	});
}

function request(host, path, next) {
	var uri = 'http://' + host + path;

	http.get(uri, function(res) {
		if (Math.floor(res.statusCode/100) !== 2) {
			logger.error('Referred resource not found %s', uri);
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
 * @param log {Object} Logger
 * @param next {function} Callback function. Entagled flag passed as argument.
 */
module.exports = function(req, res, uri, cache, options, log, next) {
	var stream = new Stream(null, { readable: false });

	logger = log || console;

	res
		.pipe(stream)
		.on('end', function() {
			var content = stream.toString('utf-8'),
				links = findLinks(content, uri, options);

			identify(links, req, uri, cache);
			next && next(!!links.length);
		});

	re = new RegExp(options['link-regex'], 'gi');
};
