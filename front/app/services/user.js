angular.module('bl.analyze.solar.surface')
  .service('userService', ['$window', '$q', '$http',
    function ($window, $q, $http) {
      var currentUser;

      this.getUserInfo = function () {
        currentUser = $window.renderCurrentUser;
        return $q.when(currentUser);
      };

      this.logout = function () {
        var apiUrl = '/users/logout';
        $http.post(apiUrl, {'withCredentials': true})
          .then(function(resp) {
            $window.location.href = resp;
            //console.log(resp);
          });
      };
    }
  ]);