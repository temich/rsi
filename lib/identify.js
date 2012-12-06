var crypto = require('crypto'),
	path = require('path'),
	fs = require('fs'),
	temp = require('temp');

/**
 * Identifies stream
 *
 * @param res {http.ServerResponse} Output stream
 * @param uri {Object} Original URI
 * @param cache {Object} Redis client
 * @param options {Object}
 * @param logger {Object}
 * @return {Object}
 */
module.exports = function(res, uri, cache, options, logger) {
	var sha = crypto.createHash('sha1'),
		disk = options['cache'] && !options['cache'].disabled,
		tmp = disk && temp.path(options['cache']['temp-prefix']),
		persist = false,
		done = false,
		closed = !disk,
		fd,
		rsi;

	logger || (logger = console);

	if (disk) {
		res.pipe(fd = fs.createWriteStream(tmp, { encoding: 'utf-8' }));

		fd.on('close', function() {
			closed = true;
			save();
		});
	}

	res.on('data', function(chunk) {
		sha.update(chunk);
	});

	res.on('end', function() {
		var digest = sha.digest('hex');

		// TODO: remove the dependency on the depth of nesting (dirlen)
		rsi = '/' + digest.substr(0, options.cache.dirlen)
			+ '/' + digest.substr(options.cache.dirlen, (options.strip || digest.length)- options.cache.dirlen)
			+ path.extname(uri.pathname);

		disk && fd.end();

		done = true;
		save();
	});

	function save() {
		if (!persist || !done || !closed) {
			return;
		}

		cache.set(uri.href, rsi);
		cache.set(rsi, uri.href);

		logger.info(uri.href + ' → ' + rsi);

		disk && saveFile();
	}

	function saveFile() {
		var file, dir;

		file = path.resolve(options.cache.root, '.' + rsi);
		dir = path.dirname(file);

		fs.existsSync(dir) || fs.mkdirSync(dir);

		var contents = fs.readFileSync(tmp);

		fs.writeFileSync(file, contents);
		fs.unlinkSync(tmp);

		logger.info('File ' + file + ' saved');
	}

	return {
		persist: function() {
			persist = true;
			save();
		},

		dispose: function() {
			fs.existsSync(tmp) && fs.unlink(tmp);
		}
	};
};
