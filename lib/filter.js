var Stream = require('memorystream');

module.exports = function(cache, options) {
	var re = new RegExp(options.re, 'gi');

	return function(req, res, next) {

		next();
	}
}
