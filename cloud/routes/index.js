"use strict";

var indexPageRouter = require("./pages/index-page-router");
var comingSoonPageRouter = require("./pages/coming-soon-page-router");
var errorPageRouter = require("./pages/error-page-router");

function register(app) {
	//routing pages
	app.use("/", indexPageRouter);
	app.use("/index", indexPageRouter);
	app.use("/coming-soon", comingSoonPageRouter);
	app.use("/error", errorPageRouter);
}

exports.register = register;