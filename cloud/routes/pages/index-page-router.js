"use strict";

var express = require("express"),
	router = express.Router(),
	authUtils = require("../../../core/server/general/core/user/auth-utils"),
	coreUtils = require("../../../core//server/libs/utils"),
	coreUserDAO = require("../../../core//server/general/core/dao/user-dao"),
	config = require("../../../config");

router.get("/", function(req, res, next) {
	authUtils.isAuthenticatedUser(req, true, function(findUserErr, currentUser) {
		if(findUserErr) {
			var redirectTo = req.protocol + "://" + req.get("host") + req.originalUrl;
			return coreUtils.redirectToLoginPage(res, redirectTo);
		} else {

			var apiDomain = config.get("apidomain"),
					platformDomain = config.get("PLATFORMDOMAIN");

      var getSourcesFunction = coreUserDAO.getUserSolarTags;
      /*if (config.get("ASSURF_COMPRESS_SOURCES")) {
          getSourcesFunction = coreUserDAO.getUserSolarTagsCompressed;
      }*/

			getSourcesFunction(currentUser, function (findTagsErr, solarTags) {
				if(findTagsErr) {
					return res.render("500", {
						errors: findTagsErr,
						currentUser: currentUser,
						solarTags: null,
						apiDomain: apiDomain,
						platformDomain: platformDomain
					});
				} else {
					return res.render("index", {
						errors: null,
						currentUser: currentUser,
						solarTags: solarTags,
						apiDomain: apiDomain,
						platformDomain: platformDomain
					});
				}
			});
		}
	});
});

module.exports = router;
