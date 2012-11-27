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
 * @return {Object}
 */
module.exports = function(res, uri, cache, options) {
	var sha = crypto.createHash('sha1'),
		tmp = temp.path(options['temp-prefix']),
		persist = false,
		done = false,
		closed = false,
		fd,
		rsi;

	res.pipe(fd = fs.createWriteStream(tmp, { encoding: 'utf-8' }));

	fd.on('close', function() {
		closed = true;
		save();
	});

	res.on('data', function(chunk) {
		sha.update(chunk);
	});

	res.on('end', function() {
		var digest = sha.digest('hex');

		rsi = '/' + digest.substr(0, options.cache.dirlen)
			+ '/' + digest.substr(options.cache.dirlen, (options.strip || digest.length)- options.cache.dirlen)
			+ path.extname(uri.pathname);

		fd.end();

		done = true;
		save();
	});

	function save() {
		var file, dir;

		if (!persist || !done || !closed) {
			return;
		}

		file = path.resolve(options.cache.root, '.' + rsi);
		dir = path.dirname(file);

		fs.existsSync(dir) || fs.mkdirSync(dir);

		var is = fs.createReadStream(tmp),
			os = fs.createWriteStream(file);

		util.pump(is, os, function() {
			fs.unlinkSync(tmp);
		});

		//fs.renameSync(tmp, file);
		cache.set(uri.href, rsi);
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
