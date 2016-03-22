/*!
 * platform-panel
 * http://github.com/BrighterLink/Core/components/platform-panel
 * Version: 0.1.0 - 2015-04-03
 * License: MIT
 */

'use strict';

angular.module('blComponents.platformPanel', ['ngImgCrop', 'ngClipboard', 'ngFileUpload'])
  .constant('globalConfig', {
    'USER-ROLE': [{id: 'BP', name: 'BP '}, {id: 'Admin', name: 'Admin '}, {id: 'TM', name: 'Team Member '}],
    'APIDOMAIN': window.apiDomain,
    'PLATFORMDOMAIN': window.platformDomain,
    'REDIRECT-URL-AFTER-LOGOUT': window.platformDomain + '/login'
  })
  .provider('url', ['globalConfig', function (globalConfig) {
    this.$get = function () {
      return {
        get: function () {
          return globalConfig.APIDOMAIN + '/v1';
        }
      };
    };
  }])
  .factory('httpRequestInterceptor', function (url) {
    var appendApiEntryPoint = function (originalUrl) {
      if (originalUrl.search(/(.html|.js|.css|.png|.svg|.jpg|.gif|.swf)/i) === -1) {
        return url.get() + originalUrl;
      } else {
        return originalUrl;
      }
    };
    return {
      appendApiEntryPoint: appendApiEntryPoint,
      request: function (config) {
        // Insert api entry point if request is api call
        config.url = appendApiEntryPoint(config.url);
        if (config.url.search(/(.html|.js|.css|.png|.svg|.jpg|.gif|.swf)/i) === -1) {
          config.withCredentials = true;
        }
        return config;
      }
    };
  })
  .factory('httpResponseInterceptor', ['$q',
    function ($q) {
      return {
        response: function (response) {
          if (typeof response.data === 'object' && response.data.success !== 1) {
            // if call is api call && call is failed
            return $q.reject(response);
          } else if (typeof response.data === 'object' && response.data.message) {
            return $q.when(response.data.message);
          } else {
            return $q.when(response);
          }
        },
        responseError: function (rejection) {
          console.error('[PlatformPanel ERROR] - ' + rejection.data.message);
          if (typeof rejection.data === 'object' && rejection.data.success === 0) {
            return $q.reject(rejection.data.message);
          } else {
            return $q.reject(rejection);
          }
        }
      };
    }])

  .config(['$httpProvider', 'ngClipProvider', function ($httpProvider, ngClipProvider) {
    $httpProvider.interceptors.push('httpRequestInterceptor');
    $httpProvider.interceptors.push('httpResponseInterceptor');
    ngClipProvider.setPath('//cdnjs.cloudflare.com/ajax/libs/zeroclipboard/2.1.6/ZeroClipboard.swf');
  }])

  .controller('platformPanelController', ['$scope', '$modal', 'AccountService', 'globalConfig',
    function ($scope, $modal, AccountService, globalConfig) {
      $scope.showResetPasswdModal = function () {
        $modal.open({
          templateUrl: '/components/platform-panel/app/templates/change-passwd-modal.html',
          controller: 'resetPasswdModalController',
          //animation: 'fade',
          keyboard: false,
          backdrop: false,
          windowClass: 'modal-style',
          resolve: {
            currentUser: function () {
              return $scope.currentUser;
            }
          }
        });
      };
      $scope.showDeleteAccountModal = function () {
        $modal.open({
          templateUrl: '/components/platform-panel/app/templates/del-account-modal.html',
          controller: 'deleteAccountModalController',
          //animation: true,
          keyboard: false,
          backdrop: false,
          windowClass: 'modal-style',
          resolve: {
            currentUser: function () {
              return $scope.currentUser;
            }
          }
        });
      };
      $scope.showProfileAvatarUploadModal = function () {
        $modal
          .open({
            templateUrl: '/components/platform-panel/app/templates/user-avatar-upload-modal.html',
            controller: 'userAvatarUploadModalController',
            //animation: true,
            keyboard: false,
            backdrop: false,
            backdropClass: 'modal-backdrop',
            windowClass: 'profile-modal-style'
          })
          .result.then(function (updatedUser) {
            $scope.isAvatarLoading = true;
            $scope.currentUser.profilePictureUrl = updatedUser.profilePictureUrl;
          });
      };

      $scope.showDeleteTMModal = function () {
        var modalInstance = $modal.open({
          templateUrl: '/components/platform-panel/app/templates/del-tm-modal.html',
          controller: 'deleteTMModalController',
          //animation: true,
          keyboard: false,
          backdrop: false,
          backdropClass: 'modal-backdrop',
          windowClass: 'modal-style',
          resolve: {
            selectedUser: function () {
              return $scope.selectedUser;
            }
          }
        });

        modalInstance.result.then(function (removedUser) {
          var index = $scope.availableUsers.indexOf(removedUser);
          if (index > -1) {
            $scope.availableUsers.splice(index, 1);
            $scope.selectedTeamPanel = 'list';
          }
        }, function () {
          // Todo: handle for the error
        });
      };

      // Current User Data is in $scope.currentUser
      $scope.currentAccount = null;
      $scope.allAccounts = null;

      $scope.accountListForSelectBox = null;  // It will be used in Select box
      $scope.userRoleForSelectBox = globalConfig['USER-ROLE'];

      $scope.loadCurrentAccountById = function (accountId) {
        AccountService
          .getAccount(accountId)
          .then(function (account) {
              $scope.currentAccount = account;
          });
      };

      $scope.loadAllAccounts = function () {
        AccountService
          .getAllAccounts()
          .then(function (accounts) {
            $scope.allAccounts = accounts;

            $scope.accountListForSelectBox = $scope.allAccounts.map(function (account) {
              return {
                id: account._id,
                name: account.name
              };
            });
          });
      };

      $scope.initLoads = function () {

        var currentAccountId;
        if ($scope.currentUser.accounts.constructor === Array
          && $scope.currentUser.accounts.length) {
          currentAccountId = $scope.currentUser.accounts[0];
        }

        if (currentAccountId) {
          $scope.currentAccountId = currentAccountId;
          $scope.loadCurrentAccountById(currentAccountId);
        }

        // When User is BP, he can get read all accounts information
        if ($scope.currentUser.role === 'BP') {
          $scope.loadAllAccounts();
        }

      };
    }
  ])

  .directive('platformPanel', function () {
      return {
        restrict: 'E',
        controller: 'platformPanelController',
        scope: {
          selected: '=',
          currentUser: '=',
          onClose: '&'
        },
        templateUrl: '/components/platform-panel/app/templates/platform-panel.html',
        link: function (scope, element, attrs) {

          scope.initLoads();

          $(document).mouseup(function (e) {
            var container = $('.ppanel-form-field-input-wrapper:visible').parents('ppanel-form-field-live');
            /*$('.ppanel-form-field-input-wrapper')*/
            if (!container.is(e.target) && container.has(e.target).length === 0) {
              $('.ppanel-form-field-input-wrapper:visible').hide().trigger('hidden.ppanel-field');
              //container.trigger('hidden.ppanel-field').hide();
            }
          });
        }
      };
    }
  );

// Polyfill
if (!Array.prototype.find) {
  Array.prototype.find = function(predicate) {
    if (this === null) {
      throw new TypeError('Array.prototype.find called on null or undefined');
    }
    if (typeof predicate !== 'function') {
      throw new TypeError('predicate must be a function');
    }
    var list = Object(this);
    var length = list.length ? list.length : 0;
    var thisArg = arguments[1];
    var value;

    for (var i = 0; i < length; i++) {
      value = list[i];
      if (predicate.call(thisArg, value, i, list)) {
        return value;
      }
    }
    return undefined;
  };
}

angular.module('blComponents.platformPanel')
    .service('UtilService', ['$timeout', '$http', '$rootScope', 
        function($timeout, $http, $rootScope) {

            this.parseName = function (name) {
                var addUserNameArray = name.split(' ');
                var addUserNames = ['', '', ''];
                switch (addUserNameArray.length) {
                    case 1:
                        addUserNames[0] = addUserNameArray[0].trim();
                        break;
                    case 2:
                        addUserNames[0] = addUserNameArray[0].trim();
                        addUserNames[2] = addUserNameArray[1].trim();
                        break;
                    case 3:
                        addUserNames[0] = addUserNameArray[0].trim();
                        addUserNames[1] = addUserNameArray[1].trim();
                        addUserNames[2] = addUserNameArray[2].trim();
                        break;
                }
                return addUserNames;
            };

            this.parseEmail = function (email) {
                var addUserEmailArray = email.split('@');
                var addUserEmails = ['', '', ''];
                addUserEmails[0] = email.trim();
                addUserEmails[1] = addUserEmailArray[0].trim();
                addUserEmails[2] = addUserEmailArray[1].trim();
                return addUserEmails;
            };

            this.parsePhoneNum = function (phonenum) {
                var regexObj = /^(?:\+?1[-. ]?)?(?:\(?([0-9]{3})\)?[-. ]?)?([0-9]{3})[-. ]?([0-9]{4})$/;
                if (regexObj.test(phonenum)) {
                    var parts = phonenum.match(regexObj);
                    var phone = '';
                    if (parts[1]) {
                        phone += '1-' + parts[1] + '-';
                    }
                    phone += parts[2] + '-' + parts[3];
                    return phone;
                }
                else {
                    //invalid phone number
                    return phonenum;
                }
            };

            /**
             * Parse Address using SmartyStreet API
             * If invalid address, it will return back raw inputted address,
             * If valid address, it will return object of City name, Street name, Zip code, State
             * @param address {string} User's raw inputted address
             * @param callback
             * @returns {*}
             */
            this.parseAddress = function (address, callback) {

                var apiUrl = '/location/address/street=' + address,
                    parsedAddress = {
                        street: '',
                        city: '',
                        country: '',
                        state: '',
                        postalCode: '',
                        address: address
                    };
                if (!address) {
                    return callback(parsedAddress);
                }

                $http
                    .get(apiUrl)
                    .then(function (resp) {
                        if (!resp.length) {
                            return callback(parsedAddress);
                        }
                        var comp = resp[0].components;
                        angular.extend(parsedAddress, {
                            street: [comp['street_name'], comp['street_suffix']].join(' '),
                            city: comp['city_name'],
                            state: comp['state_abbreviation'],
                            postalCode: comp['zipcode'],
                            country: 'USA'/*,
                             address: [ data.message[0].delivery_line_1, data.message[0].last_line ].join(' ')*/
                        });
                        if (comp['street_postdirection']) {
                            parsedAddress.street += ' ' + comp['street_postdirection'];
                        }
                        return callback(parsedAddress);
                    }, function () {
                        return callback(parsedAddress);
                    });
            };

            this.getUtilityProviders = function (uprovider) {
                var apiUrl = '/salesforce/utilityproviders/' + uprovider;
                return $http.get(apiUrl);
            };

            this.sendEmailOfNewUtil = function (uprovider) {
                var apiUrl = '/notifications/email/newutilityprovider',
                    data = {
                        'text': uprovider
                    };
                return $http
                    .post(apiUrl, data)
                    .then(function (resp) {
                        console.log('Email Results...');
                        console.log(resp);
                        return resp;
                    });
            };

            this.getCurrentBaseURL = function () {
                return location.protocol + '//' + location.hostname + (location.port ? ':' + location.port : '');
            };

            this.getTimeZones = function () {
                var apiUrl = '/others/devices/timezones';
                return $http.get(apiUrl).then(function (data) {
                    console.log('[UTIL SERVICE] SUCCESS on getTimeZoneList : ', data);
                    return data;
                });
            };

            this.CSVToArray = function (strData, strDelimiter) {
                strDelimiter = (strDelimiter || ',');
                // Create a regular expression to parse the CSV values.
                var objPattern = new RegExp((
                // Delimiters.
                '(\\' + strDelimiter + '|\\r?\\n|\\r|^)' +
                // Quoted fields.
                '(?:\"([^\"]*(?:\"\"[^\"]*)*)\"|' +
                // Standard fields.
                '([^\"\\' + strDelimiter + '\\r\\n]*))'), 'gi');
                
                var arrData = [[]];
                var strMatchedValue = '';
                var arrMatches = objPattern.exec(strData);
                
                while (arrMatches) {
                    var strMatchedDelimiter = arrMatches[1];
                    
                    if (strMatchedDelimiter.length && (strMatchedDelimiter !== strDelimiter)) {
                        arrData.push([]);
                    }
                    
                    if (arrMatches[2]) {
                        strMatchedValue = arrMatches[2].replace(
                        new RegExp('\"\"', 'g'), '\"');
                    } else {
                        strMatchedValue = arrMatches[3];
                    }
                    
                    arrData[arrData.length - 1].push(strMatchedValue);

                    arrMatches = objPattern.exec(strData);
                }
                
                return (arrData);
            };

            this.arrayToJSON = function (array) {
                var objArray = [];
                for (var i = 1; i < array.length; i++) {
                    objArray[i - 1] = {};
                    for (var k = 0; k < array[0].length; k++) {
                        var key = array[0][k];
                        
                        if(array[i][k] !== undefined) {
                            objArray[i - 1][key] = array[i][k];
                        }
                        else {
                            objArray[i - 1][key] = '';
                        }
                    }
                }

                var json = JSON.stringify(objArray);
                var str = json.replace(/},/g, '},\r\n');

                return str;
            };

            this.getClientTimeZone = function () {
                var offSet = new Date().getTimezoneOffset() * -1;
                var apiUrl = '/others/devices/clientTimezone?offset=' + offSet;
                return $http
                    .get(apiUrl)
                    .then(function (data) {
                        console.log('[UTIL SERVICE] SUCCESS on getClientTimeZone : ', data);
                        return data;
                    });
            };
        }
    ]);

angular.module('blComponents.platformPanel')
  .service('UserService', ['$http', 'UtilService', 'Upload',
    function ($http, UtilService, Upload) {
      /**
       * Enphase if authenticated or not
       * @param {string}
       * @return {object}
       */
      this.enphaseAuth = function () {
        var apiUrl = '/collection/auth?company=enphase';
        return $http.get(apiUrl);
      };

      /**
       * List all accounts
       * @param {object}
       *    example :
       *        { roles: ['Admin', 'TM'], apps: ['BrighterView', 'DataSense',
       *          'BrighterSavings', 'Verified Savings', 'Load Response',
       *          'Utility Manager', 'Programs & Projects',
       *          'ENERGY STAR Portfolio Manager'] }
       *  @return {deferred object}
       *       array of users
       */
      this.getAllUsersEx = function (data) {
        var apiUrl = '/users?searchKey=all_data';

        return $http
          .get(apiUrl, {'data': data})
          .then(function (users) {
            users.map(function (user) {
              if (user.accounts.constructor === Array && user.accounts.length) {
                user.accountId = user.accounts[0];
              }
            });
            return users;
          });
      };

      /**
       * List all accounts
       * @param {string}
       * @return {object}
       */
      this.listAllAccounts = function () {
        var apiUrl = '/users/accounts?searchKey=all_data';
        return $http.get(apiUrl);
      };

      /**
       * List all admins
       * @param {string}
       * @return {object}
       */
      this.listAllAdmins = function () {
        var apiUrl = '/users/admin';

        return $http.get(apiUrl);
      };

      /**
       * List all Users by Account Id
       * @param accountId
       */

      this.getUsersByAccount = function (accountId) {
        var apiUrl = '/accounts/' + accountId + '/users';

        return $http.get(apiUrl);
      };

      /**
       * Create an user
       * @param {string}
       * @return {object}
       */
      this.createUser = function (data) {
        var apiUrl = '/users';

        if (data.user.name) {
          var parsed = UtilService.parseName(data.user.name);
          data.user.firstName = parsed[0];
          data.user.middleName = parsed[1];
          data.user.lastName = parsed[2];
        }

        if (data.user.email.indexOf('@') > -1) {
          var emailParsed = UtilService.parseEmail(data.user.email);
          data.user.emailUser = emailParsed[0];
          data.user.emailDomain = emailParsed[1];
        }

        return $http.post(apiUrl, data);
      };

      /**
       * Update an user
       * @param {string}
       * @return {object}
       */
      this.updateUser = function (data) {
        var apiUrl = '/users/' + (data.user.id || data.user._id);

        if (data.user.name) {
          var parsed = UtilService.parseName(data.user.name);
          data.user.firstName = parsed[0];
          data.user.middleName = parsed[1];
          data.user.lastName = parsed[2];
        }

        if (data.user.email.indexOf('@') > -1) {
          var emailParsed = UtilService.parseEmail(data.user.email);
          data.user.emailUser = emailParsed[0];
          data.user.emailDomain = emailParsed[1];
        }

        return $http.put(apiUrl, data);
      };

      /**
       * Delete an user
       * @param {string}
       * @return {object}
       */
      this.deleteUser = function (userId) {
        var apiUrl = '/users/' + userId;
        return $http.delete(apiUrl);
      };

      /**
       * List social accounts of user
       * @param {string}
       * @return {object}
       */
      this.listSocialAccounts = function (userId) {
        var apiUrl = '/sociallogin/accounts/' + userId;
        return $http.get(apiUrl);
      };

      /**
       * Send reset password link to the email specified
       * @param {string} email address
       * @return {object} status
       */
      this.sendResetPwdLink = function (email) {
        var apiUrl = '/users/password/' + email;
        return $http.post(apiUrl);
      };

      /**
       * Connect BP user to SFDC User
       * @param {string} userId
       * @return {object} user object
       */
      this.connectBPUserToSFDC = function (userId) {
        var apiUrl = '/users/connectbptosfdc/' + userId;

        return $http.post(apiUrl);
      };

      this.getAccountsApps = function () {
        var apiUrl = '/users/applications';
        return $http.get(apiUrl);
      };

      this.logout = function () {
        var apiUrl = '/users/logout';
        return $http.post(apiUrl);
      };

      this.uploadLoggedInUserPhoto = function (file, thumbnail) {
        var apiUrl = '/users/assets/userprofile';

        return Upload.upload({
          url: apiUrl,
          method: 'POST',
          fields: {
            'hasCropped': 'true',
            'imageBinary': thumbnail
          },
          file: file,
          sendFieldsAs: 'form'
        });
      };
    }
  ]);

angular.module('blComponents.platformPanel')
  .service('AccountService', ['$http', '$compile', '$rootScope', 'UtilService',
    function ($http, $compile, $rootScope, utilService) {

      /**
       * Call api to Update Account
       * API: /accountapi
       * Method: PUT
       * Params: Account Info
       *
       */
      this.updateAccount = function (account) {
        var apiUrl = '/accounts/' + account._id;
        var inputJson = {account: account};
        return $http.put(apiUrl, inputJson);
      };
      /**
       * Call api to retrieve all Accounts
       * API: /accountapi/all_data
       * Method: GET
       * Params: None
       */
      this.getAllAccounts = function () {
        var apiUrl = '/accounts?searchKey=all_data';
        return $http.get(apiUrl);
      };

      /**
       * Call api to Delete Account
       * API: /accountapi/edit
       * Method: DELETE
       * Params: Account Id
       *
       */
      this.deleteAccount = function (accountId) {
        var apiUrl = '/accounts/' + accountId;
        return $http.delete(apiUrl);
      };

          /**
       * Call api to create Account
       * API: /accountapi
       * Method: POST
       * Params:
       *     account: {New Account detail}
       */
      this.createAccount = function (account, user) {
        var apiUrl = '/accounts';
        var inputJson = {account: account, user: user};
        return $http.post(apiUrl, inputJson);
      };

      /**
       * Call api to get a account by id
       * API: /salesforce/accounts/accName
       * Method: GET
       * Params:
       *
       */
      this.getAccount = function (accountId) {
        var apiUrl = '/accounts/' + accountId;
        return $http.get(apiUrl);
      };
    }
  ]);

'use strict';

angular.module('blComponents.platformPanel')

.filter('nameInitial', function () {
  return function (fullName) {
    if (!fullName) { return ''; }
    var firstName = fullName.split(' ').slice(0, -1).join(' ').toUpperCase(),
        lastName = fullName.split(' ').splice(-1).join(' ').toUpperCase();

    return firstName.substr(0,1) + lastName.substr(0,1);
  };
});
'use strict';
angular.module('blComponents.platformPanel')
  .controller('userAvatarUploadModalController', ['$scope', '$rootScope', '$modalInstance', 'UserService',
    function($scope, $rootScope, $modalInstance, UserService) {
      $scope.bUploading = false;
      $scope.uploadPercent = 0;
      $scope.bUploadFailed = false;

      $scope.avatar = {
        file: null,
        myOriginalImage: null,
        myCroppedImage: null
      };

      $scope.isFileSelected = false;

      $scope.closeModal = function() {
        if ($scope.bUploading) {
          return;
        }

        $scope.uploadPercent = 0;
        $scope.isFileSelected = false;
        $scope.bUploadFailed = false;
        $modalInstance.dismiss('cancel');
      };

      $scope.startUpload = function () {
        if ($scope.bUploading) {
          return;
        }

        $scope.bUploading = true;
        $scope.bUploadFailed = false;

        UserService
          .uploadLoggedInUserPhoto($scope.avatar.file, $scope.avatar.myCroppedImage)
          .then(function (updatedUser) {
            //success
            $scope.isFileSelected = false;
            $modalInstance.close(updatedUser);
          }, function (error) {
            //error
            $scope.uploadPercent = 0;
            $scope.bUploadFailed = true;
          }, function (evt) {
            //progress
            $scope.uploadPercent = parseInt(100.0 * evt.loaded / evt.total);
          })
          .finally(function () {
            $scope.bUploading = false;
          });
      };

      $scope.loadImagePreview = function () {
        var reader = new FileReader();
        reader.onload = function (evt) {
          if (!$scope.$$phase) {
            $scope.$apply(function () {
              $scope.avatar.myOriginalImage = evt.target.result;
            });
          }
        };
        reader.readAsDataURL($scope.avatar.file);
      };

      $scope.loadAvatar = function (files) {
        if (!files.length) {
          return false;
        }

        $scope.isFileSelected = true;
        $scope.avatar.file = files[0];

        $scope.loadImagePreview();
      };
    }
  ]);
'use strict';
angular.module('blComponents.platformPanel')
  .controller('resetPasswdModalController', ['$scope', '$modalInstance', 'UserService', 'currentUser',
    function($scope, $modalInstance, UserService, currentUser){
      $scope.errorMessage = '';
      $scope.isSaving = false;
      $scope.closeModal = function() {
        $modalInstance.dismiss('cancel');
      };

      $scope.resetPassword = function () {
        $scope.isSaving = true;
        UserService
          .sendResetPwdLink(currentUser.email)
          .then(function(resp) {
            console.log(resp);
            $scope.isSucceeded = true;
            $scope.isFailure = false;
          }, function(error){
            $scope.isFailure = true;
            $scope.isSucceeded = false;
            $scope.errorMessage = error;
          })
          .finally(function () {
            $scope.isSaving = false;
          });
      };
    }
  ]);

'use strict';
angular.module('blComponents.platformPanel')
  .controller('deleteTMModalController', ['$scope', '$modalInstance', 'UserService', 'selectedUser',
    function($scope, $modalInstance, UserService, selectedUser) {
      $scope.isRemoving = false;
      $scope.closeModal = function() {
        $modalInstance.dismiss('cancel');
      };

      $scope.deleteUser = function () {
        $scope.isRemoving = true;
        UserService
          .deleteUser(selectedUser._id)
          .then(function (resp) {
            $modalInstance.close(selectedUser);
          },
          function (error){
            alert('Failure in removing user: ', error);
          })
          .finally(function () {
            $scope.isRemoving = false;
          });
      };
    }
  ]);

'use strict';
angular.module('blComponents.platformPanel')
  .controller('deleteAccountModalController', ['$scope', '$modalInstance', 'UserService', 'currentUser', 'globalConfig',
    function($scope, $modalInstance, UserService, currentUser, globalConfig) {
      $scope.closeModal = function() {
        $modalInstance.dismiss('cancel');
      };

      $scope.isRemoving = false;
      $scope.deleteUser = function () {
        $scope.isRemoving = true;
        UserService
          .deleteUser(currentUser._id || currentUser.id)
          .then(function () {
            UserService
              .logout()
              .then(function () {
                window.location.href = globalConfig['REDIRECT-URL-AFTER-LOGOUT'];
              });
          }, function (errorMessage) {
            $scope.errorMessage = errorMessage;
          })
          .finally(function () {
            $scope.isRemoving = false;
          });
      };
    }
  ]);

'use strict';

angular.module('blComponents.platformPanel')

.filter('nameInitial', function () {
  return function (fullName) {
    if (!fullName) { return ''; }
    var firstName = fullName.split(' ').slice(0, -1).join(' ').toUpperCase(),
        lastName = fullName.split(' ').splice(-1).join(' ').toUpperCase();

    return firstName.substr(0,1) + lastName.substr(0,1);
  };
});
'use strict';

angular.module('blComponents.platformPanel')
.controller('userProfileController', ['$scope', '$interpolate', '$timeout', 'UserService',
  function ($scope, $interpolate, $timeout, UserService) {
    var infoTextTemplate = {
      'BP': ['You are part of the Brightergy Organization.',
             'As Brightergy Personnel, you have full administrative access to the entire platform.'].join(' '),
      'Admin': ['You are an Admin for the {{ accountName}} account.',
              'As an Admin, you can manage data sources, other users, and all other aspects of the account.'].join(' '),
      'TM': ['You are a member of the {{ accountName }} team.',
            'As a Team Member, you can view data sources and use them in your apps.'].join(' ')
    };
    $scope.infoTextOfRole = infoTextTemplate.TM;

    $scope.loadInfoText = function (role) {
      $scope.infoTextOfRole = $interpolate(infoTextTemplate[role])({
        accountName: $scope.currentAccount ? $scope.currentAccount.name : '<i>{ Loading... }</i>'
      });
    };

    $scope.initLoad = function () {
      $scope.$watch('currentAccount', function (n, o) {
        if (n) {
          var role = $scope.currentUser.role;
          $scope.loadInfoText(role);
        }
      });
    };

    $scope.updateCurrentUser = function () {
      return UserService.updateUser({user: $scope.currentUser});
    };
  }
])
.directive('userProfile', function() {
  return {
    restrict: 'E',
    controller: 'userProfileController',
    templateUrl: '/components/platform-panel/app/templates/user-profile.html',
    link: function(scope, element, attrs) {
      scope.isAvatarLoading = true;
      scope.initLoad();

      $(element).find('.profile-img').bind('load', function(e) {
        scope.$apply(function() {
          scope.isAvatarLoading = false;
        });
      });
    }
  };
});

'use strict';

angular.module('blComponents.platformPanel')
  .directive('ppanelTooltip', [function () {
    return {
      restrict: 'A',
      scope: {
        contentString: '=tooltipText'
      },
      link: function (scope, element, attrs) {
        var position = attrs['tooltipPosition'] || 'bottom left',
          classes = attrs['tooltipClasses'] || '',
          contentDom = attrs['tooltipContentDom'] || '';

        var content = null;

        classes += 'platform-panel drop-theme-arrows';

        if (contentDom) {
          content = document.querySelector(contentDom);
        } else if (scope.contentString) {
          content = function () {
            return scope.contentString;
          };
        } else {
          console.log('Error in asTooltip directive: as-tooltip value is missing');
          return;
        }

        element.addClass('has-tooltip');

        element.dropBox = new Drop({
          target: element[0],
          classes: classes,
          content: content,
          position: position,
          openOn: 'hover',
          constrainToWindow: true,
          tetherOptions: {
            constraints: [{
              to: 'window',
              pin: true,
              attachment: 'together'
            }]
          }
        });

        $(window).resize(function () {
          element.dropBox.position();
        });
      }
    };
  }
  ]);

'use strict';

angular.module('blComponents.platformPanel')
  .controller('teamPanelController', ['$scope', 'UserService',
    function ($scope, UserService) {
      $scope.availableUsers = [];
      $scope.selectedUser = null;
      $scope.search = {
        name: ''
      };

      $scope.selectedTeamPanel = 'list';

      $scope.userCreatable = $scope.currentUser.role === 'BP';
      $scope.userModifiable = $scope.currentUser.role === 'BP' || $scope.currentUser.role === 'Admin';

      $scope.initLoad = function () {
        function filterUsers (users) {
          // Remove the currentUser from users list
          for (var idx = 0, len = users.length; idx< len; idx++) {
            if (users[idx].id === $scope.currentUser.id) {
              users.splice(idx, 1);
              return users;
            }
          }
          return users;
        }

        if ($scope.currentUser.role === 'BP') {
          UserService
            .getAllUsersEx({roles: ['BP', 'Admin', 'TM']})
            .then(filterUsers)
            .then(function (users) {
              $scope.availableUsers = users;
            });
        } else {
          UserService
            .getUsersByAccount($scope.currentAccountId)
            .then(filterUsers)
            .then(function (users) {
              $scope.availableUsers = users;
            });
        }
      };

      $scope.showNewMemberPanel = function() {
        $scope.selectedTeamPanel = 'new';
        $scope.savedUser = {};
        $scope.isCreate = true;
      };

      $scope.showViewMemberPanel = function (user) {
        $scope.selectedTeamPanel = 'view';
        $scope.selectedUser = user;
      };

      $scope.backToTeamList = function () {
        $scope.selectedTeamPanel = 'list';
      };
    }
  ])
  .directive('teamPanel',
    function () {
      return {
        restrict: 'E',
        controller: 'teamPanelController',
        templateUrl: '/components/platform-panel/app/templates/team-panel.html',
        link: function(scope, element, attrs) {
          scope.initLoad();
        }
      };
    }
  );
'use strict';

angular.module('blComponents.platformPanel')
  .controller('teamMemberViewController', ['$scope', 'UserService', 'globalConfig',
    function ($scope, UserService) {
      $scope.updateSelectedUser = function () {
        var requestData = {
          user: angular.copy($scope.selectedUser)
        };

        delete requestData.user.socialAccounts;
        delete requestData.user.accountName;
        requestData.user.accounts = requestData.user.accountId ? [requestData.user.accountId] : [];
        delete requestData.user.accountId;

        return UserService.updateUser(requestData);
      };

      $scope.socialAccountLoading = false;

      $scope.$watch('selectedUser', function (n, o) {
        if (n !== o) {

          // Load Social Accounts
          $scope.selectedUser.socialAccounts = [];
          $scope.socialAccountLoading = true;
          UserService
            .listSocialAccounts(n.id)
            .then(function (accounts) {
              $scope.selectedUser.socialAccounts = accounts.map(function (account) {
                if (account.provider === 'windowslive') {
                  account.provider = 'live';
                }
                return {
                  provider: account.provider,
                  displayName: account.displayName,
                  profileUrl: account.profileUrl
                };
              });
            })
            .finally(function () {
              $scope.socialAccountLoading = false;
            });

          // Set User Account Name
          if (!$scope.userModifiable) {
            $scope.selectedUser.accountName = $scope.currentAccount.name;
          } else {
            var accountId = $scope.selectedUser.accountId,
              account;

            if (accountId) {
              account = $scope.accountListForSelectBox.find(function (account) {
                return account.id === accountId;
              });
            }

            $scope.selectedUser.accountName = account ? account.name : null;
          }
        }
      });
    }
  ])

  .directive('teamMemberView', function () {
    return {
      restrict: 'E',
      controller: 'teamMemberViewController',
      templateUrl: '/components/platform-panel/app/templates/team-member-view.html',
      link: function (scope, element, attrs) {
      }
    };
  });

'use strict';

angular.module('blComponents.platformPanel')
  .controller('teamMemberNewController', ['$scope', 'UserService',
    function ($scope, UserService) {
      $scope.newUser = {};
      $scope.isCreatingUser = false;
      $scope.createNewTeamMember = function (newUserForm) {

        if (newUserForm.$invalid) {
          $scope.submitted = true;
          return false;
        }
        newUserForm.$setPristine();

        var selectedAccount = $scope.allAccounts.find(function (a) {
          return a._id === $scope.newUser.accountId;
        });

        var requestData = {
          'sfdcAccountId': selectedAccount ? selectedAccount.sfdcAccountId : null,
          'user': angular.copy($scope.newUser)
        };

        requestData.user.accounts = requestData.user.accountId ? [requestData.user.accountId] : [];
        delete requestData.user.accountId;
        $scope.isCreatingUser = true;
        return UserService
          .createUser(requestData)
          .then (function (newUser) {
            if (newUser.accounts.constructor === Array && newUser.accounts.length) {
              newUser.accountId = newUser.accounts[0];
            }
            $scope.availableUsers.push(newUser);
            $scope.selectedTeamPanel = 'list';
            $scope.newUser = {};
          }, function (err) {
            alert('Sorry! Failure while creating user.');
          })
          .finally (function () {
            $scope.isCreatingUser = false;
          });
      };
    }
  ])
  .directive('teamMemberNew', function() {
    return {
      restrict: 'E',
      controller: 'teamMemberNewController',
      templateUrl: '/components/platform-panel/app/templates/team-member-new.html',
      link: function(scope, element, attrs) {
      }
    };
  });
'use strict';

angular.module('blComponents.platformPanel')
  .directive('teamMemberList', function() {
    function setCustomScroll(element) {
      var height = $(window).height();
      height = height - 220;
      $(element).mCustomScrollbar({
        setHeight: height
      });
    }

    return {
      restrict: 'E',
      templateUrl: '/components/platform-panel/app/templates/team-member-list.html',
      link: function(scope, element, attrs) {
        setCustomScroll(element.find('.list-team-member'));
        $(window).resize(function () {
          var windowWidth = $(window).width();
          if (windowWidth < 1200) {
            $(element).find('.list-team-member').mCustomScrollbar('destroy');
          } else {
            setCustomScroll(element.find('.list-team-member'));
          }
        });
      }
    };
  });
'use strict';

angular.module('blComponents.platformPanel')
  .directive('socialLogin', ['globalConfig', function (globalConfig) {
    var oneAllRendered = false;
    function renderOneAllWidget(user) {
      var documentWidth = $(document).width();
      var gridXSize = (documentWidth < 480) ? 3 : 2;

      var oneallSubdomain = 'brightergy';
      /* The library is loaded asynchronously */
      var oa = document.createElement('script');
      oa.type = 'text/javascript';
      oa.async = true;
      oa.src = '//' + oneallSubdomain + '.api.oneall.com/socialize/library.js';
      var s = document.getElementsByTagName('script')[0];
      s.parentNode.insertBefore(oa, s);
      /* Replace #your_callback_uri# with the url to your own callback script */
      var redirectUrl = location.href.indexOf('#ppanel-user') > -1 ? location.href : location.href + '#ppanel-user';
      var yourCallbackScript = globalConfig.APIDOMAIN + '/v1/sociallogin?redirect=' + encodeURIComponent(redirectUrl);
      var setCustomCssUri = globalConfig.PLATFORMDOMAIN + '/components/platform-panel/dist/platform.min.css';
      /* Dynamically add the user_token of the currently logged in user. */
      /* If the user has no user_token then leave the field blank. */
      var userToken = user.socialToken;
      /* Embeds the buttons into the container oa_social_link_container */
      var _oneall = _oneall || [];
      _oneall.push(['social_link', 'set_providers', ['google', 'facebook', 'twitter', 'amazon', 'yahoo',
        'windowslive', 'linkedin', 'github', 'openid']]);
      _oneall.push(['social_link', 'set_grid_sizes', [gridXSize, 5]]);
      _oneall.push(['social_link', 'set_callback_uri', yourCallbackScript]);
      _oneall.push(['social_link', 'set_custom_css_uri', setCustomCssUri]);
      _oneall.push(['social_link', 'set_user_token', userToken]);
      _oneall.push(['social_link', 'do_render_ui', 'oa_social_link_container']);
      window._oneall = _oneall;
      oneAllRendered = true;
    }

    return {
      restrict: 'E',
      templateUrl: '/components/platform-panel/app/templates/social-login.html',
      link: function(scope, element, attrs) {
        scope.$watch('selected', function (newVal, oldVal) {
          if (newVal !== oldVal && newVal === 'user') {
            if (!oneAllRendered) {
              renderOneAllWidget(scope.currentUser);
            }
          }
        });
      }
    };
  }]);
'use strict';

angular.module('blComponents.platformPanel')
.controller('ppanelFormFieldSelectLiveController', ['$scope',
  function ($scope) {
    $scope.isSaving = false;
    $scope.saveElement = function () {
      $scope.isSaving = true;

      return $scope.onSave({}).finally(function () {
        $scope.isSaving = false;
      });
    };
  }])
.directive('ppanelFormFieldSelectLive',
  function() {
    var oldContent;
    function saveElement (scope) {
      return scope
        .saveElement()
        .catch(function (data){
          scope.fieldModel = angular.copy(oldContent);
          return data;
        });
    }

    function hideInputBox (element) {
      element.find('.ppanel-form-field-input-wrapper').hide();
      element.find('span.echo').show();
    }

    return {
      restrict: 'E',
      scope: {
        fieldModel: '=',
        fieldList: '=',
        onSave: '&fieldOnSave'
      },
      controller: 'ppanelFormFieldLiveController',
      transclude: true,
      template: function (element, attrs) {
        return ['<i class="icon icon-edit fade" ng-if="!isSaving"></i>',
          '<i class="icon-blue-loading" ng-if="isSaving"></i>',
          '<span class="echo" ng-transclude></span>',
          '<div class="input-group ppanel-form-field-input-wrapper" style="display: none">',
            '<select type="text" class="form-control" ng-model="fieldModel" ',
              'ng-options="item.id as item.name for item in fieldList"',
              (attrs.required ? ' required' : '') + ' ng-change="updateMe(fieldModel)">',
              (attrs.default ? '<option value="">'+attrs.default+'</option>' : ''),
            '</select>',
          '</div>'].join('');
      },
      link: function(scope, element, attrs) {

        // Show/hide icon-edit when hover field text
        element
          .on('mouseenter', 'span.echo', function (e) {
            element.find('.icon').addClass('in');
          })
          .on('mouseleave', 'span.echo', function () {
            element.find('.icon').removeClass('in');
          })
          // Show text editor when click field text
          .on('click', 'span.echo', function () {
            // Backup the origin content
            oldContent = angular.copy(scope.fieldModel) || '';

            element.find('span.echo').hide();
            element.find('.input-group').show();
          })
          .on('hidden.ppanel-field', '.ppanel-form-field-input-wrapper', function () {
            scope.$apply(function () {
              scope.fieldModel = angular.copy(oldContent);
            });
            element.find('span.echo').show();
          });

        scope.updateMe = function () {
          saveElement(scope).finally(function () {
            hideInputBox(element);
          });
        };
      }
    };
  }
);
'use strict';

angular.module('blComponents.platformPanel')
  .controller('ppanelFormFieldLiveController', ['$scope',
  function ($scope) {
    $scope.isSaving = false;
    $scope.saveElement = function () {
      $scope.isSaving = true;

      return $scope
        .onSave({})
        .finally(function () {
          $scope.isSaving = false;
        });
    };
  }])
  .directive('ppanelFormFieldLive',
    function() {
      var oldContent;
      function hideTextEditor (element) {
        element.find('.ppanel-form-field-input-wrapper').hide();
        element.find('span.echo').show();
      }

      function saveElement (scope, element) {
        if (scope.innerForm.$invalid) {
          scope.$apply(function () {
            scope.submitted = true;
          });
          return false;
        }

        return scope
          .saveElement()
          .then(
            function (resp) {
              scope.updateErrorMessage = null;
              hideTextEditor(element);
              return resp;
            }, function (errorMessage) {
              scope.updateErrorMessage = errorMessage;
              element.find('input.form-control').focus();
              return errorMessage;
            }
          );
      }

      function getErrorMessage(type, validate) {
        var validateErrorMessages = [];

        if (type === 'email') {
          validateErrorMessages.push('<span ng-if="innerForm.foo.$error.email">Invalid email address</span>');
        } else if (type === 'url') {
          validateErrorMessages.push('<span ng-if="innerForm.foo.$error.url">Not valid url</span>');
        }
        if (validate) {
          validate.split(' ').map(function (v) {
            if (v === 'required') {
              validateErrorMessages
                .push('<span ng-if="innerForm.foo.$error.required">Required</span>');
            } else if (v === 'ng-phone-number') {
              validateErrorMessages
                .push('<span ng-if="innerForm.foo.$error.phonenumber">' +
                      'Please input valid a phone number <br/>( ex: 1-800-275-2273)</span>');
            } else if (v === 'ng-full-name') {
              validateErrorMessages
                .push('<span ng-if="innerForm.foo.$error.fullname">First name and Last name are required</span>');
            }
          });
        }

        var errorMessages = '';

        if (validateErrorMessages.length) {
          errorMessages = [
            '<p class="input-danger" ng-show="(innerForm.foo.$dirty || submitted) && innerForm.foo.$invalid">',
            validateErrorMessages.join(''),
            '</p>'
          ].join('');
        }
        return errorMessages;
      }

      return {
        restrict: 'E',
        scope: {
          fieldModel: '=',
          fieldForm: '=',
          onSave: '&fieldOnSave'
        },
        controller: 'ppanelFormFieldLiveController',
        transclude: true,
        template: function (element, attrs) {
          var type = attrs.type,
              availableTypes = ['text', 'password', 'date', 'datetime', 'email', 'month', 'number', 'range', 'search',
                'tel', 'time', 'url', 'week'],
              validate = attrs.validation;

          if (!type || availableTypes.indexOf(type) < 0) {
            type = 'text';
          }

          var errorMessages = getErrorMessage(type, validate);

          return [
            '<i class="icon icon-edit fade" ng-if="!isSaving"></i>',
            '<i class="icon-blue-loading" ng-if="isSaving"></i>',
            '<span class="echo" ng-transclude></span>',
            '<ng-form name="innerForm">',
            '<div class="input-group ppanel-form-field-input-wrapper" style="display: none">',
            '<input name="foo" type="'+type+'" class="form-control" ng-model="fieldModel" ng-readonly="isSaving"',
            validate ? ' ' + validate : '',
            '>',
            '<span class="input-group-btn">',
              '<button class="btn btn-primary" type="button" ng-disabled="innerForm.$invalid && innerForm.$dirty">',
              '{{ isSaving ? "Saving..." : "Save"}}</button>',
            '</span>',
            '</div>',
            errorMessages ? errorMessages : '',
            '<p class="input-danger" ng-bind="updateErrorMessage" ng-if="updateErrorMessage"></p>',
            '</ng-form>',
            ].join('');
        },
        link: function(scope, element) {
          var $element = $(element);
          scope.submitted = false;
          // Show/hide icon-edit when hover field text
          $element
            .on('mouseenter', 'span.echo', function (e) {
              $element.find('.icon').addClass('in');
            })
            .on('mouseleave', 'span.echo', function () {
              $element.find('.icon').removeClass('in');
            })
          // Show text editor when click field text
            .on('click', 'span.echo', function () {
              // Backup the origin content
              oldContent = angular.copy(scope.fieldModel) || '';

              $element.find('span.echo').hide();
              $element.find('.input-group').show().find('input.form-control').focus();
            })
            .on('hidden.ppanel-field', '.ppanel-form-field-input-wrapper', function () {
              scope.$apply(function () {
                scope.fieldModel = angular.copy(oldContent);
                scope.updateErrorMessage = null;
                scope.innerForm.$setPristine();
              });
              element.find('span.echo').show();
            })
          // Save the content by talking with backend
            .on('click', '.btn', function () {
              saveElement(scope, $element);
            })
            .on('keypress', 'input.form-control', function (e) {
              if (e.which === 13) {
                saveElement(scope, $element);
              }
            });
        }
      };
    }
  );
'use strict';

angular.module('blComponents.platformPanel')
.directive('ngFullName', function () {
  return {
    require: 'ngModel',
    link: function (scope, currentEl, attrs, ctrl) {
      var nameArray, firstName, lastName, username;
      currentEl.on('input change', function() {
        username = currentEl.val().trim();
        if (username !== '') {
          nameArray = username.split(' ');
          if (nameArray.length === 1) {
            firstName = nameArray[0];
            lastName = '';
          } else if (nameArray.length === 2) {
            firstName = nameArray[0];
            lastName = nameArray[1];
          } else if (nameArray.length === 3) {
            firstName = nameArray[0];
            lastName = nameArray[2];
          } else {
            firstName = '';
            lastName = '';
          }
          if (firstName === '' || lastName === '') {
            ctrl.$setValidity('fullname', false);
          } else {
            ctrl.$setValidity('fullname', true);
          }
        } else {
          ctrl.$setValidity('fullname', true);
        }
      });
    }
  };
})
.directive('ngPhoneNumber', function () {
  return {
    require: 'ngModel',
    link: function (scope, currentEl, attrs, ctrl) {
      var str = '^\\d\\d\\d([-.\\s]?)\\d\\d\\d\\1\\d\\d\\d\\d$|' +
        '^(:?(:?\\(\\d\\d\\d\\))?\\s*\\d\\d)?\\d[-.\\s]?\\d\\d\\d\\d$';
      var PHONE_REGEXP = new RegExp(str);
      var PHONE_REGEXP2 = /^(?:\+?1([-.\s]?))?\d\d\d\1\d\d\d\1\d\d\d\d$/;

      // var PHONE_REGEXP = /^[0-9]{1}-[0-9]{3}-[0-9]{3}-[0-9]{4}$/;
      //   /^[(]{0,1}[0-9]{3}[)\.\- ]{0,1}[0-9]{3}[\.\- ]{0,1}[0-9]{4}$/;
      //   /^(?:\+?1[-. ]?)?(?:\(?([0-9]{3})\)?[-. ]?)?([0-9]{3})[-. ]?([0-9]{4})$/;
      currentEl.on('input change', function() {
        var value = currentEl.val().trim();
        if (value !== '') {
          if (PHONE_REGEXP.test(value) || PHONE_REGEXP2.test(value)) {
            ctrl.$setValidity('phonenumber', true);
          } else {
            ctrl.$setValidity('phonenumber', false);
          }
        } else {
          ctrl.$setValidity('phonenumber', true);
        }
      });
    }
  };
});
'use strict';

angular.module('blComponents.platformPanel')
.controller('accountViewController', ['$scope', 'AccountService',
  function ($scope, AccountService) {
    // $scope.currentAccount contains Current User's account information

    $scope.accountModifiable = $scope.currentUser.role === 'BP' || $scope.currentUser.role === 'Admin';

    $scope.updateCurrentAccount = function () {
      if (!$scope.accountModifiable) {
        alert('You are not allowed to modify account information');
        return ;
      }

      return AccountService
        .updateAccount($scope.currentAccount);
    };
  }
])

.directive('accountView',
  function () {
    return {
      restrict: 'E',
      templateUrl: '/components/platform-panel/app/templates/account-view.html',
      controller: 'accountViewController',
      link: function(scope, element, attrs) {

      }
    };
  }
);
angular.module("blComponents.platformPanel").run(["$templateCache", function($templateCache) {$templateCache.put("/components/platform-panel/app/templates/account-view.html","<div id=\"account-wrapper\" class=\"ppanel-section\">\r\n    <div class=\"panel panel-default\">\r\n        <div class=\"panel-heading\">\r\n            <i class=\"icon icon-ui-info\"></i>\r\n            <h3 class=\"panel-title\">Account</h3>\r\n        </div>\r\n        <div class=\"panel-body no-padding\" ng-if=\"accountModifiable\">\r\n            <div class=\"ppanel-section-jambo-brief ppanel-section-heading\">\r\n                <div class=\"row no-margin-left-right\">\r\n                    <div class=\"col-xs-3 jambo-left\">\r\n                        <a class=\"avatar-wrapper\" href=\"#\">\r\n                            <span class=\"avatar empty\"></span>\r\n                        </a>\r\n                    </div>\r\n                    <div class=\"col-xs-8 jambo-body\">\r\n                        <h3 class=\"title row\">\r\n                            <ppanel-form-field-live id=\"inputAccountName\" field-model=\"currentAccount.name\" class=\"col-xs-12 col-sm-8\" field-on-save=\"updateCurrentAccount()\" validation=\"required\">\r\n                                {{ currentAccount.name }}\r\n                            </ppanel-form-field-live>\r\n                        </h3>\r\n                        <p>\r\n                            <a class=\"btn-link\" target=\"_blank\" href=\"{{currentAccount.webSite || \'#\'}}\">{{currentAccount.webSite || \'No Site\'}}</a>\r\n                        </p>\r\n                        <a href=\"#\" class=\"sf-linked pull-right\"><i class=\"icon icon-salesforce\"></i></a>\r\n                    </div>\r\n                </div>\r\n            </div>\r\n            <div class=\"form-wrapper\">\r\n                <form class=\"form-platform-panel form-horizontal\">\r\n                    <fieldset class=\"form-group no-margin-left-right\">\r\n                        <label for=\"inputContactPhone\" class=\"col-xs-3 control-label\">*Contact Phone</label>\r\n                        <div class=\"col-xs-4 control-wrapper\">\r\n                            <ppanel-form-field-live id=\"inputContactPhone\" field-model=\"currentAccount.phone\" field-on-save=\"updateCurrentAccount()\" type=\"tel\" validation=\"required ng-phone-number\">\r\n                                {{ currentAccount.phone || \"No Phone Number\" }}\r\n                            </ppanel-form-field-live>\r\n                        </div>\r\n                    </fieldset>\r\n                    <fieldset class=\"form-group no-margin-left-right\">\r\n                        <label for=\"inputCustomUrl\" class=\"col-xs-3 control-label\">Custom Url</label>\r\n                        <div class=\"col-xs-4 control-wrapper\">\r\n                            <ppanel-form-field-live id=\"inputCustomUrl\" field-model=\"currentAccount.cname\" field-on-save=\"updateCurrentAccount()\">\r\n                                {{currentAccount.cname ? (\'http://\' + currentAccount.cname + \'.brightergy.com\') : \'No Url\'}}\r\n                            </ppanel-form-field-live><br/>\r\n                            <a class=\"btn-link\" clip-copy=\"\'http://\' + currentAccount.cname + \'.brightergy.com\'\" ng-if=\"currentAccount.cname\">\r\n                                Copy Link\r\n                            </a>\r\n                        </div>\r\n                    </fieldset>\r\n                    <fieldset class=\"form-group no-margin-left-right\">\r\n                        <label for=\"inputCustomEmail\" class=\"col-xs-3 control-label\">*Email</label>\r\n                        <div class=\"col-xs-4 control-wrapper\">\r\n                            <ppanel-form-field-live id=\"inputCustomEmail\" field-model=\"currentAccount.email\" field-on-save=\"updateCurrentAccount()\" type=\"email\" validation=\"required\">\r\n                                {{currentAccount.email || \'No Email\'}}\r\n                            </ppanel-form-field-live>\r\n                        </div>\r\n                    </fieldset>\r\n\r\n                    <fieldset class=\"form-group no-margin-left-right\">\r\n                        <label for=\"inputCustomWebSite\" class=\"col-xs-3 control-label\">*Website</label>\r\n                        <div class=\"col-xs-4 control-wrapper\">\r\n                            <ppanel-form-field-live id=\"inputCustomWebSite\" field-model=\"currentAccount.webSite\" field-on-save=\"updateCurrentAccount()\" type=\"url\" validation=\"required\">\r\n                                {{currentAccount.webSite || \'No Website\'}}\r\n                            </ppanel-form-field-live>\r\n                        </div>\r\n                    </fieldset>\r\n\r\n                    <fieldset class=\"form-group no-margin-left-right\">\r\n                        <label for=\"inputCustomBillingAddress\" class=\"col-xs-3 control-label\">Billing Address</label>\r\n                        <div class=\"col-xs-4 control-wrapper\">\r\n                            <ppanel-form-field-live id=\"inputCustomBillingAddress\" field-model=\"currentAccount.billingAddress\" field-on-save=\"updateCurrentAccount()\">\r\n                                {{currentAccount.billingAddress || \'No Address\'}}\r\n                            </ppanel-form-field-live>\r\n                        </div>\r\n                    </fieldset>\r\n\r\n                    <fieldset class=\"form-group no-margin-left-right\">\r\n                        <label for=\"inputCustomShippingAddress\" class=\"col-xs-3 control-label\">Shipping Address</label>\r\n                        <div class=\"col-xs-4 control-wrapper\">\r\n                            <ppanel-form-field-live id=\"inputCustomShippingAddress\" field-model=\"currentAccount.shippingAddress\" field-on-save=\"updateCurrentAccount()\">\r\n                                {{currentAccount.shippingAddress || \'No Address\'}}\r\n                            </ppanel-form-field-live>\r\n                        </div>\r\n                    </fieldset>\r\n                </form>\r\n            </div>\r\n        </div>\r\n        <div class=\"panel-body no-padding\" ng-if=\"!accountModifiable\">\r\n            <div class=\"ppanel-section-jambo-brief ppanel-section-heading\">\r\n                <div class=\"row no-margin-left-right\">\r\n                    <div class=\"col-xs-3 jambo-left\">\r\n                        <a class=\"avatar-wrapper\" href=\"#\">\r\n                            <span class=\"avatar empty\"></span>\r\n                        </a>\r\n                    </div>\r\n                    <div class=\"col-xs-8 jambo-body\">\r\n                        <h3 class=\"title row\">\r\n                            {{ currentAccount.name }}\r\n                        </h3>\r\n                        <p>\r\n                            <a class=\"btn-link\" target=\"_blank\" href=\"{{currentAccount.webSite || \'#\'}}\">{{currentAccount.webSite || \'No Site\'}}</a>\r\n                        </p>\r\n                        <a href=\"#\" class=\"sf-linked pull-right\"><i class=\"icon icon-salesforce\"></i></a>\r\n                    </div>\r\n                </div>\r\n            </div>\r\n            <div class=\"form-wrapper\">\r\n                <form class=\"form-platform-panel form-horizontal\">\r\n                    <fieldset class=\"form-group no-margin-left-right\">\r\n                        <label for=\"inputContactPhone\" class=\"col-xs-3 control-label\">*Contact Phone</label>\r\n                        <div class=\"col-xs-4 control-wrapper\">\r\n                            {{ currentAccount.phone || \"No Phone Number\" }}\r\n                        </div>\r\n                    </fieldset>\r\n                    <fieldset class=\"form-group no-margin-left-right\">\r\n                        <label for=\"inputCustomUrl\" class=\"col-xs-3 control-label\">Custom Url</label>\r\n                        <div class=\"col-xs-4 control-wrapper\">\r\n                            {{currentAccount.cname ? (\'http://\' + currentAccount.cname + \'.brightergy.com\') : \'No Url\'}}<br/>\r\n                            <a class=\"btn-link\" clip-copy=\"\'http://\' + currentAccount.cname + \'.brightergy.com\'\" ng-if=\"currentAccount.cname\">\r\n                                Copy Link\r\n                            </a>\r\n                        </div>\r\n                    </fieldset>\r\n                    <fieldset class=\"form-group no-margin-left-right\">\r\n                        <label for=\"inputCustomEmail\" class=\"col-xs-3 control-label\">*Email</label>\r\n                        <div class=\"col-xs-4 control-wrapper\">\r\n                            {{currentAccount.email || \'No Email\'}}\r\n                        </div>\r\n                    </fieldset>\r\n\r\n                    <fieldset class=\"form-group no-margin-left-right\">\r\n                        <label for=\"inputCustomWebSite\" class=\"col-xs-3 control-label\">*Website</label>\r\n                        <div class=\"col-xs-4 control-wrapper\">\r\n                            {{currentAccount.webSite || \'No Website\'}}\r\n                        </div>\r\n                    </fieldset>\r\n\r\n                    <fieldset class=\"form-group no-margin-left-right\">\r\n                        <label for=\"inputCustomBillingAddress\" class=\"col-xs-3 control-label\">Billing Address</label>\r\n                        <div class=\"col-xs-4 control-wrapper\">\r\n                            {{currentAccount.billingAddress || \'No Address\'}}\r\n                        </div>\r\n                    </fieldset>\r\n\r\n                    <fieldset class=\"form-group no-margin-left-right\">\r\n                        <label for=\"inputCustomShippingAddress\" class=\"col-xs-3 control-label\">Shipping Address</label>\r\n                        <div class=\"col-xs-4 control-wrapper\">\r\n                            {{currentAccount.shippingAddress || \'No Address\'}}\r\n                        </div>\r\n                    </fieldset>\r\n                </form>\r\n            </div>\r\n        </div>\r\n    </div>\r\n</div>");
$templateCache.put("/components/platform-panel/app/templates/change-passwd-modal.html","<div class=\"modal-wrapper account-delete-modal\">\r\n	<div class=\"header row\">\r\n		<div class=\"title col-md-12\">Reset Password</div>\r\n		<button type=\"button\" class=\"close modal-close\" data-dismiss=\"modal\" aria-label=\"Close\" ng-click=\"closeModal();\">\r\n            <span aria-hidden=\"true\">x</span>\r\n        </button>\r\n	</div>\r\n	<div class=\"row\">\r\n        <div class=\"col-md-12\" ng-if=\"!isSucceeded && !isFailure\">\r\n            <p>This will send reset password link to your personal email address. </p>\r\n            <p>Please check your inbox.</p>\r\n        </div>\r\n        <div class=\"col-md-12\" ng-if=\"isSucceeded\">\r\n            <p>An e-mail has been sent with password reset instruction at your inbox.</p>\r\n            <p>Please check your inbox or re-send the email</p>\r\n        </div>\r\n        <div class=\"col-md-12 text-danger\" ng-if=\"isFailure\">\r\n            <p>There was an error while resetting your password.</p>\r\n        </div>\r\n	</div>\r\n	<div class=\"row\">\r\n		<a ng-click=\"resetPassword()\" class=\"btn danger\" ng-disabled=\"isSaving\" >\r\n			{{ isSaving ? \'Sending...\' : (isSucceeded ? \'Re-send\' : \'Confirm and Send Link\') }}\r\n		</a>\r\n		<a ng-click=\"closeModal()\" class=\"btn info\">\r\n			Cancel\r\n		</a>\r\n	</div>\r\n</div>\r\n");
$templateCache.put("/components/platform-panel/app/templates/del-account-modal.html","<div class=\"modal-wrapper account-delete-modal\">\r\n	<div class=\"header row\">\r\n		<div class=\"title col-md-12\">We hate to see you go!</div>\r\n		<button type=\"button\" class=\"close modal-close\" data-dismiss=\"modal\" aria-label=\"Close\" ng-click=\"closeModal();\"><span aria-hidden=\"true\">x</span></button>\r\n	</div>\r\n	<div class=\"row\">\r\n		<div class=\"col-md-12\">\r\n			<p>This will delete your personal user account and all related information from BrighterLink. We hate to see you go! Please confirm that you wish to delete your personal user account.</p>\r\n		</div>\r\n		<div class=\"col-md-12 text-danger\" ng-if=\"errorMessage\">\r\n			<p>There was an error deleting your user account.</p>\r\n		</div>\r\n	</div>\r\n	<div class=\"row\">\r\n		<a ng-click=\"deleteUser()\" class=\"btn danger\" ng-disabled=\"isRemoving\" >Confirm and Delete Access</a>\r\n		<a ng-click=\"closeModal()\" class=\"btn info\">Cancel</a>\r\n	</div>\r\n</div>\r\n");
$templateCache.put("/components/platform-panel/app/templates/del-tm-modal.html","<div class=\"modal-wrapper tm-delete-modal\">\r\n	<div class=\"header row\">\r\n		<div class=\"title col-md-12\">Delete Team Member</div>\r\n		<button type=\"button\" class=\"close modal-close\" data-dismiss=\"modal\" aria-label=\"Close\" ng-click=\"closeModal();\">\r\n			<span aria-hidden=\"true\">x</span>\r\n		</button>\r\n	</div>\r\n	<div class=\"row\">\r\n		<p>Please confirm that you really want to delete this team member.</p>\r\n	</div>\r\n	<div class=\"row\">\r\n		<a ng-click=\"deleteUser()\" class=\"btn danger\" ng-disabled=\"isRemoving\"> {{ isRemoving ? \'Removing...\' : \'Confirm\' }}</a>\r\n		<a ng-click=\"closeModal()\" class=\"btn info\">Cancel</a>\r\n	</div>\r\n</div>");
$templateCache.put("/components/platform-panel/app/templates/platform-panel.html","<div id=\"platform-panel-wrapper\">\r\n	<account-panel ng-show=\"selected==\'account\'\">\r\n        <div class=\"panel-content col-lg-8\">\r\n            <account-view></account-view>\r\n        </div>\r\n        <div class=\"panel-content col-lg-4\">\r\n            <team-panel></team-panel>\r\n        </div>\r\n    </account-panel>\r\n\r\n    <user-panel ng-show=\"selected==\'user\'\">\r\n        <div class=\"panel-content col-lg-8\">\r\n            <user-profile></user-profile>\r\n        </div>\r\n        <div class=\"panel-content col-lg-4\">\r\n            <social-login></social-login>\r\n        </div>\r\n    </user-panel>\r\n\r\n    <button type=\"button\" class=\"close\" data-dismiss=\"modal\" aria-label=\"Close\" ng-click=\"onClose({});\">\r\n        <span aria-hidden=\"true\">x</span>\r\n    </button>\r\n</div>");
$templateCache.put("/components/platform-panel/app/templates/social-login.html","<div id=\"social-login-wrapper\" class=\"ppanel-section\">\r\n    <div class=\"panel panel-default\">\r\n        <div class=\"panel-heading\">\r\n            <i class=\"icon icon-ui-info\"></i>\r\n            <h3 class=\"panel-title\">Social Login</h3>\r\n        </div>\r\n        <div class=\"panel-body no-padding\">\r\n            <div class=\"social-networks\">\r\n                <p>Login to BrighterLink using your social networks</p>\r\n                <div id=\"oa_social_link_container\"></div>\r\n            </div>\r\n        </div>\r\n    </div>\r\n</div>");
$templateCache.put("/components/platform-panel/app/templates/team-member-list.html","<div class=\"team-member-list-header\" ng-class=\"{\'without-new-btn\':!userCreatable}\">\r\n    <div id=\"searchInputWrapper\">\r\n        <input type=\"text\" class=\"form-control\" ng-model=\"search.name\" placeholder=\"Search\"/>\r\n        <i class=\"icon icon-search\"></i>\r\n    </div>\r\n    <div id=\"createNewWrapper\" ng-if=\"userCreatable\">\r\n        <button class=\"btn btn-bl-default\" ng-click=\"showNewMemberPanel()\">\r\n            <i class=\"icon icon-plus\"></i> Add New Member\r\n        </button>\r\n    </div>\r\n</div>\r\n<div class=\"team-member-list-content\">\r\n    <ul class=\"list-team-member\">\r\n        <li ng-repeat=\"user in availableUsers | filter: search\" ng-click=\"showViewMemberPanel(user)\">\r\n            <div class=\"media list-team-member-item\">\r\n                <div class=\"media-left\">\r\n                    <span class=\"member-photo\" ng-show=\"user.profilePictureUrl\">\r\n                        <img ng-src=\"{{user.profilePictureUrl}}\" alt=\"{{user.name}}\"/>\r\n                    </span>\r\n                    <span class=\"member-photo none\" ng-show=\"!user.profilePictureUrl\">\r\n                        {{user.name | nameInitial}}\r\n                    </span>\r\n                </div>\r\n                <div class=\"media-body\">\r\n                    <h5 class=\"media-heading\">\r\n                        {{ user.name }}\r\n                        <span class=\"label label-primary\">{{user.role}}</span>\r\n                    </h5>\r\n                    <p>{{ user.email }}</p>\r\n                    <i class=\"icon icon-edit\" ng-if=\"userModifiable\"></i>\r\n                </div>\r\n            </div>\r\n        </li>\r\n    </ul>\r\n</div>");
$templateCache.put("/components/platform-panel/app/templates/team-member-new.html","<form id=\"frmTeamMemberCreate\" name=\"newUserForm\" class=\"form-platform-panel form-horizontal\" ng-submit=\"createNewTeamMember(newUserForm)\" novalidate>\r\n    <div class=\"row member-create-upload\">\r\n        <div class=\"col-sm-3 col-xs-3 no-left-padding\">\r\n            <div class=\"member-photo\">&nbsp;</div>\r\n        </div>\r\n        <div class=\"col-sm-1 col-xs-1\"></div>\r\n        <div class=\"col-sm-8 col-xs-8\">\r\n            <input type=\"text\" class=\"form-control\" placeholder=\"Name\" ng-model=\"newUser.name\" required name=\"name\" ng-full-name>\r\n            <p class=\"input-danger\" ng-show=\"(newUserForm.name.$dirty || submitted) && newUserForm.name.$invalid\">\r\n                <span ng-if=\"newUserForm.name.$error.required\">Name is required.</span>\r\n                <span ng-if=\"newUserForm.name.$error.fullname\">First name and Last name are required.</span>\r\n            </p>\r\n        </div>\r\n    </div>\r\n    <div class=\"form-group\">\r\n        <label for=\"selectNewTeamMemberAccount\" class=\"col-xs-4 control-label no-left-padding\">Account</label>\r\n        <div class=\"col-xs-8 control-wrapper\">\r\n            <select ng-model=\"newUser.accountId\" ng-options=\"item.id as item.name for item in accountListForSelectBox\" id=\"selectNewTeamMemberAccount\" name=\"account\" required class=\"form-control\">\r\n                <option value=\"\">Select Account ...</option>\r\n            </select>\r\n            <p class=\"input-danger\" ng-show=\"(newUserForm.name.$dirty || submitted) && newUserForm.account.$invalid\">\r\n                <span ng-if=\"newUserForm.account.$error.required\">Account is required.</span>\r\n            </p>\r\n        </div>\r\n    </div>\r\n    <div class=\"form-group\">\r\n        <label for=\"selectNewTeamMemberRole\" class=\"col-xs-4 control-label no-left-padding\">Role</label>\r\n        <div class=\"col-xs-8 control-wrapper\">\r\n            <select name=\"role\" ng-model=\"newUser.role\" ng-options=\"item.id as item.name for item in userRoleForSelectBox\" id=\"selectNewTeamMemberRole\" required class=\"form-control\">\r\n                <option value=\"\">Select Role ...</option>\r\n            </select>\r\n            <p class=\"input-danger\" ng-show=\"(newUserForm.name.$dirty || submitted) && newUserForm.role.$invalid\">\r\n                <span ng-if=\"newUserForm.role.$error.required\">Role is required.</span>\r\n            </p>\r\n        </div>\r\n    </div>\r\n    <div class=\"form-group\">\r\n        <label for=\"selectNewTeamMemberPhone\" class=\"col-xs-4 control-label no-left-padding\">Contact Phone</label>\r\n        <div class=\"col-xs-8 control-wrapper\">\r\n            <input id=\"selectNewTeamMemberPhone\" type=\"tel\" class=\"form-control\" placeholder=\"Example: 1-800-275-2273\" name=\"phone\" ng-model=\"newUser.phone\" ng-phone-number>\r\n            <p class=\"input-danger\" ng-show=\"(newUserForm.name.$dirty || submitted) && newUserForm.phone.$invalid\">\r\n                <span ng-if=\"newUserForm.phone.$error.phonenumber\">Please input valid a phone number ( ex: 1-800-275-2273).</span>\r\n            </p>\r\n        </div>\r\n    </div>\r\n    <div class=\"form-group\">\r\n        <label for=\"selectNewTeamMemberEmail\" class=\"col-xs-4 control-label no-left-padding\">Email</label>\r\n        <div class=\"col-xs-8 control-wrapper\">\r\n            <input id=\"selectNewTeamMemberEmail\" type=\"email\" name=\"email\" class=\"form-control\" placeholder=\"Email\" ng-model=\"newUser.email\" required>\r\n            <p class=\"input-danger\" ng-show=\"(newUserForm.name.$dirty || submitted) && newUserForm.email.$invalid\">\r\n                <span ng-if=\"newUserForm.email.$error.required\">Email is required.</span>\r\n                <span ng-if=\"newUserForm.email.$error.email\">Invalid email address.</span>\r\n            </p>\r\n        </div>\r\n    </div>\r\n    <div class=\"form-group\">\r\n        <div class=\"col-xs-offset-4 col-xs-8\">\r\n            <button type=\"submit\" class=\"btn btn-primary\" ng-disabled=\"isCreatingUser\">{{ isCreatingUser ? \'Saving...\' : \'Save\' }}</button>\r\n            <button type=\"button\" class=\"btn btn-default\" ng-click=\"backToTeamList();\">Back to List</button>\r\n        </div>\r\n    </div>\r\n</form>");
$templateCache.put("/components/platform-panel/app/templates/team-member-view.html","<div class=\"team-member-view-content\">\r\n    <div class=\"ppanel-section-jambo-brief ppanel-section-heading\">\r\n        <div class=\"row member-action\">\r\n            <div class=\"col-xs-4 jambo-left\">\r\n                <span class=\"member-photo none\" ng-show=\"!selectedUser.profilePictureUrl\">\r\n                    {{selectedUser.name | nameInitial}}\r\n                </span>\r\n                <span class=\"member-photo\" ng-show=\"selectedUser.profilePictureUrl\">\r\n                    <img ng-src=\"{{selectedUser.profilePictureUrl}}\" alt=\"{{selectedUser.name | nameInitial}}\"/>\r\n                </span>\r\n                <span class=\"label label-primary\">\r\n                    {{selectedUser.role}}\r\n                </span>\r\n            </div>\r\n            <div class=\"col-xs-8 jambo-body\">\r\n                <h3 class=\"title\">\r\n                    <ppanel-form-field-live id=\"inputMemberViewName\" field-model=\"selectedUser.name\" field-on-save=\"updateSelectedUser()\" required=\"\">\r\n                        {{selectedUser.name}}\r\n                    </ppanel-form-field-live>\r\n                    <a ng-click=\"showDeleteTMModal();\"><i class=\"icon icon-trash\"></i></a>\r\n                </h3>\r\n            </div>\r\n        </div>\r\n    </div>\r\n    <fieldset class=\"form-wrapper member-info\" ng-if=\"!userModifiable\">\r\n        <form class=\"form-platform-panel form-horizontal\">\r\n            <fieldset class=\"form-group\">\r\n                <label for=\"inputMemberViewAccount\" class=\"col-xs-4 control-label no-left-padding\">Account</label>\r\n                <div class=\"col-xs-8 control-wrapper\">\r\n                    {{selectedUser.accountName || \'No Account\'}}\r\n                </div>\r\n            </fieldset>\r\n            <fieldset class=\"form-group\">\r\n                <label class=\"col-xs-4 control-label no-left-padding\">Role</label>\r\n                <div class=\"col-xs-8 control-wrapper\">\r\n                    {{selectedUser.role || \'No Role\'}}\r\n                </div>\r\n            </fieldset>\r\n\r\n            <fieldset class=\"form-group\">\r\n                <label for=\"inputMemberViewContact\" class=\"col-xs-4 control-label no-left-padding\">Contact Phone</label>\r\n                <div class=\"col-xs-8 control-wrapper\">\r\n                    {{selectedUser.phone || \'No phone\'}}\r\n                </div>\r\n            </fieldset>\r\n\r\n            <fieldset class=\"form-group\">\r\n                <label for=\"inputMemberViewEmail\" class=\"col-xs-4 control-label no-left-padding\">Email</label>\r\n                <div class=\"col-xs-8 control-wrapper\">\r\n                    {{selectedUser.email}}\r\n                </div>\r\n            </fieldset>\r\n\r\n            <fieldset class=\"form-group\">\r\n                <label class=\"col-xs-4 control-label no-left-padding\">Social accounts</label>\r\n                <div class=\"col-xs-8\">\r\n                    <span ng-repeat=\"account in selectedUser.socialAccounts\">\r\n                        <a class=\"social-link\" href=\" {{ account.profileUrl || \'#\' }}\" target=\"_blank\">\r\n                            <i class=\"icon icon-{{ account.provider }}\"></i>\r\n                        </a>\r\n                    </span>\r\n                    <span ng-if=\"!selectedUser.socialAccounts.length\" style=\"line-height:34px;\">\r\n                        {{ socialAccountLoading ? \'Loading...\' : \'User is not linked social network with his account.\' }}\r\n                    </span>\r\n                </div>\r\n            </fieldset>\r\n\r\n            <fieldset class=\"form-group\">\r\n                <div class=\"col-xs-offset-4 col-xs-8\">\r\n                    <button type=\"button\" class=\"btn btn-default\" ng-click=\"backToTeamList();\">Back to List</button>\r\n                </div>\r\n            </fieldset>\r\n        </form>\r\n    </fieldset>\r\n    <fieldset class=\"form-wrapper member-info\" ng-if=\"userModifiable\">\r\n        <form class=\"form-platform-panel form-horizontal\">\r\n            <fieldset class=\"form-group\">\r\n                <label for=\"inputMemberViewAccount\" class=\"col-xs-4 control-label no-left-padding\">Account</label>\r\n                <div class=\"col-xs-8 control-wrapper\">\r\n                    <!--<ppanel-form-field-select-live id=\"inputMemberViewAccount\" field-model=\"selectedUser.accountId\" field-list=\"accountListForSelectBox\" field-on-save=\"updateSelectedUser()\" default=\"Select account ...\" required>\r\n                        {{selectedUser.accountName || \'No Account\'}}\r\n                    </ppanel-form-field-select-live>-->\r\n                    {{selectedUser.accountName || \'No Account\'}}\r\n                </div>\r\n            </fieldset>\r\n\r\n            <fieldset class=\"form-group\">\r\n                <label class=\"col-xs-4 control-label no-left-padding\">Role</label>\r\n                <div class=\"col-xs-8 control-wrapper\">\r\n                    <!--<ppanel-form-field-select-live id=\"inputMemberViewRole\" field-model=\"selectedUser.role\" field-list=\"userRoleForSelectBox\" field-on-save=\"updateSelectedUser()\">\r\n                        {{selectedUser.role || \'No Role\'}}\r\n                    </ppanel-form-field-select-live>-->\r\n                    {{selectedUser.role || \'No Role\'}}\r\n                </div>\r\n            </fieldset>\r\n\r\n            <fieldset class=\"form-group\">\r\n                <label for=\"inputMemberViewContact\" class=\"col-xs-4 control-label no-left-padding\">Contact Phone</label>\r\n                <div class=\"col-xs-8 control-wrapper\">\r\n                    <ppanel-form-field-live id=\"inputMemberViewContact\" field-model=\"selectedUser.phone\" field-on-save=\"updateSelectedUser()\" type=\"tel\">\r\n                        {{selectedUser.phone || \'No phone\'}}\r\n                    </ppanel-form-field-live>\r\n                </div>\r\n            </fieldset>\r\n\r\n            <fieldset class=\"form-group\">\r\n                <label for=\"inputMemberViewEmail\" class=\"col-xs-4 control-label no-left-padding\">Email</label>\r\n                <!--<div class=\"col-xs-8 control-wrapper\" ng-if=\"selectedUser.role ==\'BP\'\">\r\n                    {{selectedUser.email || \'No Email\'}}\r\n                </div>-->\r\n                <div class=\"col-xs-8 control-wrapper\">\r\n                    <ppanel-form-field-live id=\"inputMemberViewEmail\" field-model=\"selectedUser.email\" field-on-save=\"updateSelectedUser()\" type=\"email\" required=\"\">\r\n                        {{selectedUser.email}}\r\n                    </ppanel-form-field-live>\r\n                </div>\r\n            </fieldset>\r\n\r\n            <fieldset class=\"form-group\">\r\n                <label class=\"col-xs-4 control-label no-left-padding\">Social accounts</label>\r\n                <div class=\"col-xs-8\">\r\n                    <span ng-repeat=\"account in selectedUser.socialAccounts\">\r\n                        <a class=\"social-link\" href=\" {{ account.profileUrl || \'#\' }}\" target=\"_blank\">\r\n                            <i class=\"icon icon-{{ account.provider }}\"></i>\r\n                        </a>\r\n                    </span>\r\n                    <span ng-if=\"!selectedUser.socialAccounts.length\" style=\"line-height:34px;\">\r\n                        {{ socialAccountLoading ? \'Loading...\' : \'User is not linked social network with his account.\' }}\r\n                    </span>\r\n                </div>\r\n            </fieldset>\r\n\r\n            <fieldset class=\"form-group\">\r\n                <div class=\"col-xs-offset-4 col-xs-8\">\r\n                    <button type=\"button\" class=\"btn btn-default\" ng-click=\"backToTeamList();\">Back to List</button>\r\n                </div>\r\n            </fieldset>\r\n        </form>\r\n    </fieldset>\r\n</div>");
$templateCache.put("/components/platform-panel/app/templates/team-panel.html","<div id=\"team-members-wrapper\" class=\"ppanel-section\">\r\n    <div class=\"panel panel-default\">\r\n        <div class=\"panel-heading\">\r\n            <i class=\"icon icon-ui-info\"></i>\r\n            <h3 class=\"panel-title\">\r\n                Team members <i>({{availableUsers.length}})</i>\r\n            </h3>\r\n        </div>\r\n        <div class=\"panel-body\">\r\n            <div class=\"member-section team-member-list\" ng-show=\"selectedTeamPanel == \'list\'\">\r\n                <team-member-list></team-member-list>\r\n            </div>\r\n            <div class=\"member-section team-member-new\" ng-show=\"selectedTeamPanel == \'new\'\">\r\n                <team-member-new></team-member-new>\r\n            </div>\r\n            <div class=\"member-section team-member-view\" ng-show=\"selectedTeamPanel == \'view\'\">\r\n                <team-member-view></team-member-view>\r\n            </div>\r\n        </div>\r\n    </div>\r\n</div>\r\n<del-tm-modal ng-hide=\"!showConfirmModal\"></del-tm-modal>");
$templateCache.put("/components/platform-panel/app/templates/user-avatar-upload-modal.html","<div class=\"modal-wrapper user-profile-modal\">\r\n	<div class=\"header row\">\r\n		<div class=\"title col-md-12\">Upload User Profile</div>\r\n		<button type=\"button\" class=\"close modal-close\" data-dismiss=\"modal\" aria-label=\"Close\" ng-click=\"closeModal();\">\r\n			<span aria-hidden=\"true\">x</span>\r\n		</button>\r\n	</div>\r\n	<div class=\"row\">\r\n		<div class=\"photo-upload-section\" ng-show=\"isFileSelected\">\r\n			<div class=\"photo-upload-left-panel\">\r\n				<div class=\"cropArea\">\r\n					<img-crop image=\"avatar.myOriginalImage\" result-image=\"avatar.myCroppedImage\" area-type=\"square\" change-on-fly=\"true\"></img-crop>\r\n				</div>\r\n				<h4>Drag frame to adjust portrait.</h4>\r\n				<div>\r\n					<button class=\"select-another-file action-btn btn-ok btn-no-margin\" ng-disabled=\"bUploading\" ngf-select ngf-change=\"loadAvatar($files, $event)\" ngf-accept=\"\'image/*\'\" ngf-multiple=\"false\">Select another photo</button>\r\n				</div>\r\n			</div>\r\n			<div class=\"photo-upload-right-panel\">\r\n				<h4>Cropped Image:</h4>\r\n				<div>\r\n					<img ng-src=\"{{avatar.myCroppedImage}}\" alt=\"Avatar-Preview\"/>\r\n				</div>\r\n				<div class=\"button-group\" style=\"display:inline-flex; position:relative;\">\r\n					<button ng-click=\"startUpload();\" class=\"action-btn btn-ok btn-no-margin\" ng-disabled=\"bUploading\">Upload Picture</button>\r\n					<button ng-click=\"closeModal();\" class=\"action-btn btn-cancel\" ng-disabled=\"bUploading\">Cancel</button>\r\n				</div>\r\n				<div class=\"progress\" ng-show=\"bUploading\">\r\n					<div class=\"progress-bar\" role=\"progressbar\" aria-valuenow=\"{{uploadPercent}}\" aria-valuemin=\"0\" aria-valuemax=\"100\" style=\"width:{{ uploadPercent }}%\">\r\n						<span class=\"sr-only\">{{uploadPercent}}% Complete</span>\r\n					</div>\r\n				</div>\r\n				<div class=\"upload-failed\" ng-show=\"bUploadFailed\">Uploading failed... Try again.</div>\r\n			</div>\r\n			<div class=\"clearfix\"></div>\r\n		</div>\r\n		<div class=\"no-photo-section\" ng-hide=\"isFileSelected\">\r\n			<div class=\"upload-btn-wrapper\" ngf-drop ngf-select ngf-drag-over-class=\"dragover\" ngf-change=\"loadAvatar($files, $event)\" ngf-accept=\"\'image/*\'\" ngf-multiple=\"false\">\r\n				<div class=\"upload-button btn-ok\">Upload a new photo</div><!--ng-click=\"selectFileClicked();\"-->\r\n			</div>\r\n		</div>\r\n	</div>\r\n</div>\r\n");
$templateCache.put("/components/platform-panel/app/templates/user-profile.html","<div id=\"user-profile-wrapper\" class=\"pp-grid-container ppanel-section\">\r\n    <div class=\"panel panel-default\">\r\n        <div class=\"panel-heading\">\r\n            <i class=\"icon icon-ui-info\"></i>\r\n            <h3 class=\"panel-title\">User Profile</h3>\r\n        </div>\r\n\r\n        <div class=\"panel-body no-padding\">\r\n            <div class=\"ppanel-section-jambo-brief ppanel-section-heading\">\r\n                <div class=\"row no-margin-left-right\">\r\n                    <div class=\"col-xs-3 jambo-left\">\r\n                        <a class=\"avatar-wrapper\" ng-click=\"showProfileAvatarUploadModal();\">\r\n                            <span class=\"avatar empty\" ng-show=\"!currentUser.profilePictureUrl\">\r\n                                {{currentUser.name | nameInitial}}\r\n                            </span>\r\n                            <span class=\"avatar\" ng-show=\"currentUser.profilePictureUrl\">\r\n                                <img class=\"profile-img\" src=\"{{currentUser.profilePictureUrl}}\" alt=\"\" ng-hide=\"isAvatarLoading\">\r\n                                <span class=\"profile-loading\" ng-show=\"isAvatarLoading\" ng-if=\"currentUser.profilePictureUrl\">Loading...</span>\r\n                            </span>\r\n                            <b class=\"change-hover\">Change</b>\r\n                        </a>\r\n                    </div>\r\n                    <div class=\"col-xs-8 jambo-body\">\r\n                        <h3 class=\"title row\">\r\n                            <ppanel-form-field-live id=\"inputUserName\" field-model=\"currentUser.name\" field-on-save=\"updateCurrentUser()\" class=\"col-xs-12 col-sm-8\" validation=\"required ng-full-name\">\r\n                                {{ currentUser.name }}\r\n                                <span class=\"label label-primary\">{{currentUser.role}}</span>\r\n                            </ppanel-form-field-live>\r\n                        </h3>\r\n                        <p>\r\n                            <a class=\"btn-link\" target=\"_blank\" href=\"mailto:{{currentUser.email}}\">{{currentUser.email}}</a>\r\n                        </p>\r\n                    </div>\r\n                </div>\r\n            </div>\r\n            <div class=\"form-wrapper\">\r\n                <form class=\"form-platform-panel form-horizontal\">\r\n                    <fieldset class=\"form-group no-margin-left-right\">\r\n                        <label class=\"col-xs-3 control-label\">Account</label>\r\n                        <div class=\"col-xs-4 control-wrapper\" ng-bind=\"currentAccount.name || \'No Account\'\">\r\n                        </div>\r\n                    </fieldset>\r\n\r\n                    <fieldset class=\"form-group no-margin-left-right\">\r\n                        <label class=\"col-xs-3 control-label\">Role</label>\r\n                        <div class=\"col-xs-4 control-wrapper\">\r\n                            {{ currentUser.role || \"No Role\" }}\r\n                            <a class=\"link-more\">\r\n                                <i class=\"icon icon-ui-info\" ppanel-tooltip tooltip-text=\"infoTextOfRole\"></i>\r\n                            </a>\r\n                        </div>\r\n                    </fieldset>\r\n\r\n                    <fieldset class=\"form-group no-margin-left-right\">\r\n                        <label for=\"inputUserPhone\" class=\"col-xs-3 control-label\">Phone</label>\r\n                        <div class=\"col-xs-4 control-wrapper\">\r\n                            <ppanel-form-field-live id=\"inputUserPhone\" field-model=\"currentUser.phone\" field-on-save=\"updateCurrentUser()\" validation=\"ng-phone-number\">\r\n                                {{ currentUser.phone || \"No Phone Number\" }}\r\n                            </ppanel-form-field-live>\r\n                        </div>\r\n                    </fieldset>\r\n\r\n                    <fieldset class=\"form-group no-margin-left-right\">\r\n                        <label for=\"inputUserEmail\" class=\"col-xs-3 control-label\">Email</label>\r\n                        <div class=\"col-xs-4 control-wrapper\">\r\n                            <ppanel-form-field-live id=\"inputUserEmail\" field-model=\"currentUser.email\" field-on-save=\"updateCurrentUser()\" type=\"email\" validation=\"required\">\r\n                                {{ currentUser.email || \'No Email Address\' }}\r\n                            </ppanel-form-field-live>\r\n                        </div>\r\n                    </fieldset>\r\n                </form>\r\n            </div>\r\n        </div>\r\n        <div class=\"user-info-actions row\">\r\n            <div class=\"col-sm-12 no-padding\">\r\n                <div class=\"col-xs-3 col-profile-action-space\">&nbsp;</div>\r\n                <div class=\"col-xs-3 btn-wrap\">\r\n                    <!--a class=\"link action\" ng-click=\"showChangePasswdModal = true\"><i class=\"icon icon-password\"></i><span>Reset Password</span></a-->\r\n                    <a class=\"link action\" ng-click=\"showResetPasswdModal();\"><i class=\"icon icon-password\"></i><span>Reset Password</span></a>\r\n                </div>\r\n                <div class=\"col-xs-3 btn-wrap\">\r\n                    <a ng-click=\"showDeleteAccountModal();\" class=\"link action delete-account\"><i class=\"icon icon-trash\"></i><span>Delete Account</span></a>\r\n                </div>\r\n            </div>\r\n        </div>\r\n    </div>\r\n</div>\r\n");}]);
