angular.module('bl.analyze.solar.surface')
  .controller('TopNavBarController', ['$scope', '$rootScope', '$location', 'userService', 'kmService',
    function ($scope, $rootScope, $location, userService, kmService) {
      $scope.userInfo = {
        name: 'Ben Padric',
        accountname: 'Brightergy',
        online: true
      };

      $scope.blAppList = [
        {
          className: 'app-panel-btn-present',
          label: 'Present',
          linkTo: '/coming-soon'
        }, {
          className: 'app-panel-btn-analyze',
          label: 'Analyze',
          linkTo: '/'
        }, {
          className: 'app-panel-btn-classroom',
          label: 'Classroom',
          linkTo: '/coming-soon'
        }, {
          className: 'app-panel-btn-verify',
          label: 'Verify',
          linkTo: '/coming-soon'
        }, {
          className: 'app-panel-btn-respond',
          label: 'Respond',
          linkTo: '//resurf.brighterlink.io'
        }, {
          className: 'app-panel-btn-utilities',
          label: 'Utilities',
          linkTo: '/coming-soon'
        }, {
          className: 'app-panel-btn-projects',
          label: 'Projects',
          linkTo: '/coming-soon'
        }, {
          className: 'app-panel-btn-connect',
          label: 'Connect',
          linkTo: '/coming-soon'
        }
      ];

      userService
        .getUserInfo()
        .then(function (user) {
          $scope.userInfo = angular.extend(user, {
            nameInitial: user.firstName.substr(0,1) + user.lastName.substr(0,1),
            online: true
          });

          if (user.profilePictureUrl) {
            $scope.userInfo.avatarStyle = {
              'background-image': 'url(' + user.profilePictureUrl + ')',
              'background-size': '100% 100%',
              'font-size': '0'
            };
          }
        });

      $rootScope.panelData = {
        user: window.renderCurrentUser
      };

      $scope.doLogout = function () {
        userService.logout();
      };

      $scope.openPlatformPanel = function (menu) {
        $rootScope.isShowPlatformPanel = true;
        $rootScope.panelData.menu = menu;

        //Kissmetrics tracking
        var contentObj = {'Page': menu};
        if (menu === 'user') {
          kmService.trackEvent('record', 'Visited User Section in Platform Panel', contentObj);
        } else if (menu === 'account') {
          kmService.trackEvent('record', 'Visited Account Section in Platform Panel', contentObj);
        } else {
          kmService.trackEvent('record', 'Visited Platform Panel', contentObj);
        }
      };
    }
  ]);