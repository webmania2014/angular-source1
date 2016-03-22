'use strict';

var dependencies = [
  'ngRoute',
  'ngTable',
  'ui.bootstrap',
  'highcharts-ng',
  'btford.socket-io',
  'angularMoment',
  'ngAnimate',
  'blComponents.platformPanel'
],


app = angular.module('bl.analyze.solar.surface', dependencies);


app.constant('wsEntryPoint', window.apiDomain);

app.constant('wsConfig', {
  'reconnection delay': 1000,
  'reconnection limit': 1000,
  'max reconnection attempts': 'Infinity'
});

app.constant('firstLoadEventList', ['assurf:power', 'assurf:energy', 'assurf:weather']);

app.constant('mainStageResponseList', ['assurf:solarenergygeneration', 'assurf:savings',
  'assurf:totalenergygeneration', 'assurf:equivalencies', 'assurf:realtimepower',
  'assurf:yieldcomparator', 'assurf:actualpredictedenergy', 'assurf:carbonavoided']);

app.constant('angularMomentConfig', {
  preprocess: 'unix',
  timezone: jstz.determine().name() || 'America/Chicago' // e.g. 'Default Time is Kansas Time'
});

app.config(['$routeProvider', '$locationProvider', function ($routeProvider, $locationProvider) {
  $locationProvider
    .html5Mode(false)
    .hashPrefix('!');
  $routeProvider.
    when('/main', {
      templateUrl: 'app/partials/main-stage.html',
      controller: 'MainStageController'
    }).
    when('/help', {
      templateUrl: 'app/partials/help.html',
      controller: 'HelpCenterController'
    }).
    otherwise({
        redirectTo: '/main'
    });
}]);

app.run(function () {

});
angular.module('bl.analyze.solar.surface')
  .constant('elementWeatherHistoryConfig', {
    weatherCountPerRequest: 20,
    weatherStatus: ['cloudy', 'rain', 'snow', 'snow-clear', 'storm', 'sun-cloud', 'sun-rain', 'sunny']
  })

  .controller('elementWeatherHistoryController', 
    ['$rootScope', '$scope', '$attrs', 'elementWeatherHistoryConfig', 'SocketIO',
    function ($rootScope, $scope, $attrs, config, SocketIO) {

      $rootScope.weatherHistory = [];
      $scope.minDate = moment().add(0 - config.weatherCountPerRequest, 'days').unix();
      $scope.checkLoadMore = true;
      $scope.availableLoadMore = true;
      $scope.loaded = false;

      $scope.socketRequest = {
        request: 'assurf:weatherhistory', 
        data: { 
            'dateRange': {
                'from': moment().add(0 - config.weatherCountPerRequest, 'days').format('YYYY-MM-DD'),
                'to': moment().format('YYYY-MM-DD')
            }
        }
      };

      $scope.getMore = function () {

        $scope.loaded = false;

        var lastHistory = $rootScope.weatherHistory[$rootScope.weatherHistory.length - 1],
            lastDate = lastHistory.date;

        var fromByRule = moment.unix(lastDate)
                        .add(0-config.weatherCountPerRequest, 'days')
                        .format('YYYY-MM-DD'),
            fromByParam = moment.unix($scope.minDate).format('YYYY-MM-DD');

        if(fromByParam > fromByRule) {
          $scope.socketRequest.data.dateRange.from = fromByParam;
          $scope.checkLoadMore = false;
        } else {
          $scope.socketRequest.data.dateRange.from = fromByRule;
          $scope.checkLoadMore = true;
        }

        $scope.socketRequest.data.dateRange.to = moment.unix(lastDate).format('YYYY-MM-DD');

        SocketIO.emit($scope.socketRequest.request, $scope.socketRequest.data);
      };

      $scope.assignValues = function(data) {
        //console.log('socket widget data............');
        //console.log(data);

        if($scope.loaded) {
          return false;
        }

        var tmpObj = {};
        data.history.reverse();
        angular.forEach(data.history, function(objHistory){
            tmpObj.date = objHistory.time;
            tmpObj.highTemperature = Math.round(objHistory.temperatureMax);
            tmpObj.lowTemperature = Math.round(objHistory.temperatureMin);
            tmpObj.sunriseTime = objHistory.sunriseTime;
            tmpObj.sunsetTime = objHistory.sunsetTime;
            tmpObj.humidity = Math.round(objHistory.humidity * 100);
            tmpObj.pressure = Math.round(objHistory.pressure);
            tmpObj.windSpeed = Math.round(objHistory.windSpeed);
            tmpObj.city = objHistory.city || '';
            tmpObj.status = objHistory.icon;
            $rootScope.weatherHistory.push(tmpObj);
            tmpObj = {};
        });

        $scope.loaded = true;

        if(!$scope.checkLoadMore) {
          $scope.availableLoadMore = false;
        }
      };

      $rootScope.changedDateWeatherHistory = function(start, end) {
        $rootScope.weatherHistory = [];

        $scope.socketRequest.data.dateRange.to = moment.unix(end).add(1, 'days').format('YYYY-MM-DD');
        
        var fromByRule = moment.unix(end)
                        .add(1-config.weatherCountPerRequest, 'days')
                        .format('YYYY-MM-DD'),
            fromByParam = moment.unix(start).add(1, 'days').format('YYYY-MM-DD');

        if(fromByParam > fromByRule) {
          $scope.socketRequest.data.dateRange.from = fromByParam;
          $scope.checkLoadMore = false;
        } else {
          $scope.socketRequest.data.dateRange.from = fromByRule;
          $scope.checkLoadMore = true;
        }

        $scope.minDate = start;

        $scope.initLoads();
      };


      $scope.initLoads = function () {
        $scope.loaded = false;

        SocketIO.emit($scope.socketRequest.request, $scope.socketRequest.data);

        SocketIO.watch($scope.socketRequest.request, function(sourcesData) {
          $scope.assignValues(sourcesData);
        });
      };

      $scope.initLoads();

    }
  ])

  .directive('elementWeatherHistory', ['$timeout', function($timeout) {
    return {
      restrict: 'E',
      scope: true,
      templateUrl: 'app/elements/weather-history/template.html',
      transclude: true,
      controller: 'elementWeatherHistoryController',
      replace: true,
      link : function (scope, element, attrs) {

        $timeout(function () {
          var $scrollContainer = $(element).find('.weather-history-control'),
            elementTop = $('.sp-content').height() + $('.sp-top').height() + 150;

          var elementContainerHeight = $(window).height() - elementTop;
          // 10 -> give some padding bottom;

          $scrollContainer.mCustomScrollbar({
            axis: 'y',
            theme: 'light',
            setHeight: elementContainerHeight,
            callbacks: {
              onTotalScroll:function(){
                scope.getMore();
              },
              onTotalScrollOffset:100,
              alwaysTriggerOffsets:false
            }
          });
        });
      }
    };
  }]);
'use strict';

angular.module('bl.analyze.solar.surface')

  .controller('elementTEGController',
  ['$scope', '$timeout', '$filter', '$interpolate', 'energyService', 'SourceSelectionEventService',
  function($scope, $timeout, $filter, $interpolate, energyService, SourceSelectionEventService) {
    $scope.isDataLoaded = false;
    $scope.dateRange = 'month';
    $scope.lastTEG = {
      'value' : 0,
      'unit': 'kWh'
    };

    var infoPanelTextSrc = 'Your system generated <span class="orange">{{ TEG }}kWh</span> {{ dateRange }}.';
    $scope.infoPanelText = infoPanelTextSrc;

    $scope.$watch('dateRange', function(newVal,oldVal) {
      if (newVal !== oldVal) {
        $scope.isDataLoaded = false;
        energyService.emitTEG(newVal);
      }
    });

    $scope.startWatchTEG = function () {
      energyService.watchTEG(function (TEG) {
        $scope.lastTEG = TEG;
        $scope.infoPanelText = $interpolate(infoPanelTextSrc)({
          TEG: $filter('number')(TEG.value, 0),
          dateRange: $scope.dateRange === 'total' ? 'as total' : 'over the last ' + $scope.dateRange
        });
        $scope.isDataLoaded = true;
      });
    };

    SourceSelectionEventService.listen(function () {
      $scope.isDataLoaded = false;
    });

    $scope.startWatchTEG();
  }])
  .directive('elementTotalEnergyGeneration', ['$modal', function ($modal) {
    var openDrilldown = function () {
      /*return $modal.open({
        templateUrl: 'app/elements/solar-energy-generation/drilldown.html',
        controller: 'EnergyGenerationDrilldownCtrl',
        windowClass: 'drilldown',
        size: 'lg',
        resolve: {
          parentScope: function() {
            return scope;
          }
        }
      });*/
    };

    return {
      restrict: 'E',
      scope: true,
      controller: 'elementTEGController',
      templateUrl: 'app/elements/total-energy-generation/template.html',
      link : function ($scope, element) {
        element.on('click', '.widget', openDrilldown);
      }
    };
  }]);

angular.module('bl.analyze.solar.surface')
  .directive('elementEnergyBySunhours', ['$rootScope', '$compile', '$modal', '$timeout', 'blSocket',
    function($rootScope, $compile, $modal, $timeout, blSocket) {
    return {
      restrict: 'E',
      scope: true,
      templateUrl: 'app/elements/sunhours-energy/template.html',
      link : function (scope, element, attrs, controller) {
        
        scope.init = function () {
          var d = new Date();
          scope.fullYear = d.getFullYear();
          scope.currentYear = scope.fullYear;
          scope.prevYear = scope.currentYear - 1;
          scope.nextYear = scope.currentYear + 1;
          scope.totalHours = 0;
        };

        blSocket.on('connected', function(data){
          if (data.socketId){
            $rootScope.socketId = data.socketId;
              scope.socketRequest = {
                request: 'assurf:sunhours', 
                data: { 
                  'socketId' : data.socketId,
                  'year': scope.currentYear
                }
            };
          }
        });

        blSocket.on('assurf:sunhours', function(data) {
          if(data.success) {
            scope.drawHeatmap(data);
          }
        });

        blSocket.on('assurf:sunhoursrealtime', function(data) {
          if(data.success) {
            scope.init();
            scope.drawHeatmap(data);
          }
        });

        scope.calendarChartConfig = {
           chart: {
            type: 'heatmap'
          },
          title: {
            text: 'Sun-Hours',
            floating: true,
            align: 'right',
            x: -45,
            y: 85,
            useHTML: true,
             style: {
                color: '#89969d',
                fontSize: '12px',
                fontFamily: 'HelveticaNeueW02-55Roma',
                transform: 'rotate(-90deg)',
                '-webkit-transform': 'rotate(-90deg)',
                '-moz-transform': 'rotate(-90deg)',
                '-ms-transform': 'rotate(-90deg)',
                '-o-transform': 'rotate(-90deg)',
                'filter': 'progid:DXImageTransform.Microsoft.BasicImage(rotation=3)'
              }
          },
          xAxis: {
            opposite: true,
            lineWidth: 0,
            minorGridLineWidth: 0,
            lineColor: 'transparent',
            minorTickLength: 0,
            tickLength: 0,
            type: 'datetime',
            labels: {
              align: 'left',
              x: 5,
              format: '{value:%b}',
              style: {
                color: '#89969d',
                fontFamily: 'HelveticaNeueW02-75Bold' 
              }
            }
          },
          yAxis: {
            categories: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
            title: null,
            labels: {
              style: {
                color: '#5d6b87',
                fontFamily: 'HelveticaNeueW02-55Roma',
                'text-align' : 'center'
              }
            }
          },
          colorAxis: {
            min: 0,
            minColor: '#FFFFFF',
            maxColor: '#fab8a0'
          },
          legend: {
            align: 'right',
            layout: 'vertical',
            margin: 35,
            verticalAlign: 'top',
            y: 25,
            symbolHeight: 90
          },
          tooltip: {
            backgroundColor: 'rgba(35, 43, 57, 0.9)',
            borderColor: null,
            borderWidth: 0,
            shadow: false,
            useHTML: true,
            formatter: function () {
              var date = moment(this.point.x).format('ll');
              return '<span>' + date + '</span> <br><span class="text-orange">' + 
                this.point.value.toFixed(2) + ' Sun-hours</span>  <br><br>' +
                '<span>On ' + date + ', the sun rose at </span> <br>' + 
                '<span>6:21am and set at 6:47pm, and it </span> <br>' + 
                '<span>was a mostly sunny day. Due to the </span> <br>' + 
                '<span>angle of the sun at this time of year, </span> <br>' + 
                '<span>the sun’s maximum potential is </span> <br>' + 
                '<span>relatively small, so there were only </span> <br>' + 
                '<span class="text-orange">' + this.point.value.toFixed(2) + 
                '</span><span> Sun-Hours for the day.</span>';
            },
            style: {
              color: '#FFFFFF',
              fontSize: '11px',
              padding: '20px',
              fontFamily: 'HelveticaNeueW02-55Roma' 
            }
          },
          series: [{
            borderWidth: 1, 
            borderColor: '#e9e9e9',
            colsize: 24 * 7 * 3600 * 1000,
            data: []
          }],
          credits: {
            enabled: false
          },
          exporting: { enabled: false }

        };

        scope.drawHeatmap = function (data) {
          var seriesData = data.message;
          scope.totalHours = 0;
          angular.forEach(seriesData, function (val, key) {
             scope.totalHours += val[2];
          });
          scope.calendarChartConfig.series[0].data = data.message;
          $('#calendarChart').html('');
          $('#calendarChart').highcharts(scope.calendarChartConfig);
        };

        scope.goPrevYear = function() {
          scope.currentYear = scope.currentYear - 1;
          scope.prevYear = scope.currentYear - 1;
          scope.nextYear = scope.currentYear + 1;
          scope.socketRequest.data.year = scope.currentYear;

          blSocket.emit(scope.socketRequest.request, scope.socketRequest.data);  
        };

        scope.goNextYear = function() {
          scope.currentYear = scope.currentYear + 1;
          scope.nextYear = scope.currentYear + 1;
          scope.prevYear = scope.currentYear - 1;

          scope.socketRequest.data.year = scope.currentYear;

          blSocket.emit(scope.socketRequest.request, scope.socketRequest.data);  
        };

        scope.init();
      }
    };
  }]);
'use strict';

angular.module('bl.analyze.solar.surface')
  .controller('ElementSavingController', ['$scope', 'savingService', 'SourceSelectionEventService',
    function($scope, savingService, SourceSelectionEventService) {
      $scope.isDataLoaded = false;
      $scope.dateRange = 'month';
      $scope.lastSavingData = {
        kpi: {
          totalSavingPerDateRange: 0,
          totalSavings: 0
        }
      };

      SourceSelectionEventService.listen(function () {
        $scope.isDataLoaded = false;
      });

      $scope.$watch('dateRange', function (newVal, oldVal) {
        if (newVal !== oldVal) {
          savingService.emit($scope.dateRange);
          $scope.isDataLoaded = false;
        }
      });

      $scope.startWatchSavings = function () {
        savingService
          .watchTable(function (tableData) {
            $scope.lastSavingData.table = tableData;
          })
          .watch(function (savingData) {
            angular.extend($scope.lastSavingData, savingData);
            $scope.isDataLoaded = true;
          });
      };

      $scope.startWatchSavings();
    }])
  .directive('elementSavings', ['$modal', 'savingService', 'SourceSelectionEventService',
    function($modal) {
      return {
        restrict: 'E',
        scope: true,
        templateUrl: 'app/elements/savings/template.html',
        controller: 'ElementSavingController',
        link : function (scope, element) {
          element.on('click', '.widget', function () {
            $modal.open({
              templateUrl: 'app/elements/savings/drilldown.html',
              controller: 'SavingsDrilldownController',
              windowClass: 'drilldown',
              size: 'lg',
              resolve: {
                primaryElementData: function () {
                  return scope.lastSavingData;
                }
              }
            });
          });
        }
      };
    }]);
'use strict';
angular.module('bl.analyze.solar.surface')
  .constant('savingChartConfig', {
    legend: { enabled: false }, exporting: { enabled: false }, credits: { enabled: false },
    title: { text: null }, subtitle: { text: null },
    chart: { style:{fontFamily: 'HelveticaNeueW02-55Roma, Helvetica, Arial', fontSize: '11px', overflow: 'visible'}},
    xAxis: { title: { text: null }, categories: [], lineColor: '#adadad', tickColor: '#adadad',
      lineWidth: 1, tickPosition: 'inside' },
    tooltip: {
      useHTML:true,borderColor:null,borderWidth:0,borderRadius:3,shadow:false,shape:'callout',
      spacing:[0,0,0,0],shared:true,backgroundColor:'rgba(35, 43, 57, 0.9)',
      style:{padding: '20px',whiteSpace: 'normal',zIndex: '99999',color:'#fff'},
      valueDecimals: 2
    },
    series: []
  })
  .controller('SavingsDrilldownController',
  ['$scope', '$modalInstance', '$timeout', '$interpolate', 'primaryElementData', 'savingService',
    'solarTagService', 'savingChartConfig',
    function ($scope, $modalInstance, $timeout, $interpolate, primaryElementData, savingService,
              solarTagService, chartConfig) {
      var getResponsiveChartHeight = function () {
        var windowHeight = $(window).height();
        var chartHeight = 320;
        if(windowHeight > 1048) {
          chartHeight += windowHeight - 1048;
        }
        return chartHeight;
      };

      $scope.savingData = primaryElementData;
      $scope.isDataLoaded = {
        comboChart: false,
        areaChart: false,
        table: true
      };
      $scope.tableChart = {
        'data': [],
        'columns': [],
        'loaded': false
      };
      $scope.initChart = function () {
        $scope.comboChart = {
          options: angular.extend(angular.copy(chartConfig), {
            yAxis: [
              {labels:{format:'${value}',style:{color:'#6b9e67'}},opposite:true,title:{text:null}},
              {labels:{enabled:false},opposite:true,title:{text:null}}
            ]
          }),
          xAxis: { categories: [] },
          series: [],
          loading: false,
          size: { height: getResponsiveChartHeight() }
        };

        $scope.areaChart = {
          options: angular.extend(angular.copy(chartConfig), {
            chart: { type : 'areaspline' },
            plotOptions: {areaspline:{fillOpacity:0.3,marker:{enabled:false},states:{hover:{lineWidth:1}}}},
            yAxis: {title:{text:null}, opposite: true, labels: {format: '${value}',style:{color:'#6b9e67'}}}
          }),
          xAxis: { categories: [] },
          series: [],
          loading: false,
          size: { height: 460 }
        };

        var comboChartLoaded = function () {$scope.isDataLoaded.comboChart = true;},
            areaChartLoaded = function () {$scope.isDataLoaded.areaChart = true;};

        $scope.comboChart.options.chart.events = {load: comboChartLoaded, redraw: comboChartLoaded};
        $scope.areaChart.options.chart.events = {load: areaChartLoaded, redraw: areaChartLoaded};
        $scope.areaChart.options.tooltip.crosshairs = {
          width: 2,
          color: 'gray',
          dashStyle: 'shortdot'
        };
      };

      $scope.startWatchDrilldown = function () {
        savingService
          .watchTable(function (data) {
            $scope.updateTable(data);
          })
          .watch(function (data) {
            $scope.updateDrilldown(data);
          });
      };

      $scope.updateDrilldown = function(data) {
        $scope.updateKPI(data);
        $scope.updateComboChart(data);
        $scope.updateAreaChart(data);
        if (data.table) {
          $scope.updateTable(data.table);
        }
      };

      $scope.updateKPI = function (savingData) {
        $scope.kpiData = savingData.kpi;
      };

      $scope.updateComboChart = function (savingData) {
        savingData.comboChart.series.map(function (serie) {
          if (serie.type === 'column') {
            serie.color = '#6b9e67';
            serie.pointWidth = 8;
            serie.yAxis = 0;
            serie.tooltip = {valueSuffix: '$'};
          } else {
            serie.color = '#ff6d2d';
            serie.allowPointSelect = false;
            serie.marker = {enabled: false};
            serie.yAxis = 1;
            serie.tooltip = {valueSuffix: 'kWh'};
          }
        });

        $scope.comboChart.xAxis.categories = savingData.comboChart.categories;
        $scope.comboChart.series = savingData.comboChart.series;
      };

      $scope.updateAreaChart = function(savingData) {
        savingData.areaChart.series.map(function (serie, index) {
          var sourceDetail = solarTagService.getSourceDetail(serie.name);
          serie.tooltip = {valueSuffix: '$'};
          serie.color = sourceDetail ? sourceDetail.color : randomColor({luminosity: 'dark'});
          serie.name = sourceDetail ? sourceDetail.displayName : serie.name;
          serie.fillColor = {
            'linearGradient': [0,0,0,300],
            'stops': [
              [0, serie.color],
              [1, Highcharts.Color(serie.color).setOpacity(0).get('rgba')]
            ]
          };

        });

        $scope.areaChart.xAxis.categories = savingData.areaChart.categories;
        $scope.areaChart.series = savingData.areaChart.series;
      };

      $scope.updateTable = function(data) {
        $scope.tableChart = {
          data: data,
          columns: $scope.kpiData.totalProductionBySources.map(function (production) {
            return production.displayName;
          }),
          sourceNames: $scope.kpiData.totalProductionBySources.map(function (production) {
            return production.name;
          })
        };

        $scope.isDataLoaded.table = true;
      };

      /*$(window).resize(function(){
        var chartHeight = getResponsiveChartHeight();
        var chartWidth = $('#savingsComboChart').width();
        var chart = $('#savingsComboChart').highcharts();
        if((chart !== null) && (typeof chart !== 'undefined')) {
          chart.setSize(chartWidth, chartHeight, true);
        }
      });*/
      $scope.closeDrilldown = function () {
        $modalInstance.dismiss('cancel');
      };

      $timeout(function () {
        $scope.initChart();
        $scope.updateDrilldown(primaryElementData);
        $scope.startWatchDrilldown();
      }, 50);
  }]);
angular.module('bl.analyze.solar.surface').directive('elementSolarEnergyGeneration', 
  ['$modal', '$timeout', '$window', '$filter', 'SocketIO', 'SourceSelectionEventService', 'solarTagService', 
  function($modal, $timeout, $window, $filter, SocketIO, SourceSelectionEventService, solarTagService) {
    
    return {
      restrict: 'E',
      scope: true,
      templateUrl: 'app/elements/solar-energy-generation/template.html',
      link : function (scope, element, attrs, controller) {
        
        scope.currentDimension = 'month';
        scope.currentDate = moment().month();
        scope.currentDateLabel = moment().month(scope.currentDate).format('MMMM');
        scope.prevDateLabel = moment().month(scope.currentDate-1).format('MMMM');
        scope.nextDateLabel = moment().month(scope.currentDate+1).format('MMMM');
        if(scope.currentDate === 0) {
          angular.element('.date-range-nav .prev-nav').removeClass('active');
        }
        else {
          angular.element('.date-range-nav .prev-nav').addClass('active');
        }

        scope.kpiData = {};
        scope.comboChart = null;
        scope.lastUpdated = null;
        scope.pieData = {};
        
        scope.mainChart = {
          'categories': [],
          'series': [],
          'loaded': false
        };

        scope.$watch('currentDimension', function (newValues, oldValues) {
          if (newValues !== oldValues) {
            scope.changeDimension(newValues);
          }
        });

        scope.detailElement = function() {
          $modal.open({
            templateUrl: 'app/elements/solar-energy-generation/drilldown.html',
            controller: 'EnergyGenerationDrilldownCtrl',
            windowClass: 'drilldown',
            size: 'lg',
            resolve: {
              parentScope: function() {
                return scope;
              }
            }
          });
        };

        scope.socketRequest = {
          request: 'assurf:getsolarenergygeneration', 
          data: { 
            'dateRange': scope.currentDimension,
            'selectedFacilities': [],
            'selectedScopes': []
          }
        };

        SocketIO.watch('assurf:solarenergygeneration', function(segData) {
          scope.assignValues(segData);
        });

        SocketIO.watch('assurf:sources', function(sourcesData) {
          scope.assignLastUpdatedTime(sourcesData);
        });

        SourceSelectionEventService.listen(function (event, selectedSources) {
          scope.mainChart.loaded = false;
        });

        scope.assignValues = function (data) {
          scope.kpiData.totalEnergyProduction = data.totalProduction;
          scope.kpiData.totalProductionBySources = data.totalProductionBySources;
          scope.kpiData.totalSavings = data.totalSaving;
          scope.kpiData.facilities = [];
          angular.forEach(data.totalProductionBySources, function(value, name) {
            var sourceDetail = solarTagService.getSourceDetail(name);
            scope.kpiData.facilities.push({
              'name': sourceDetail ? sourceDetail.displayName : name,
              'value': value
            });
          });
          
          scope.mainChart.categories = data.mainChart.categories;
          scope.mainChart.series = data.mainChart.series;
          
          scope.pieData = data.pie;
          
          scope.drawGraph();
        };

        scope.assignLastUpdatedTime = function (data) {
          var lastUpdated = null, facilityDate = null;
          angular.forEach(data, function(facility) {
            if(!lastUpdated) {
              lastUpdated = new Date(facility.lastReportedTime);
            }
            else {
              facilityDate = new Date(facility.lastReportedTime);
              if(lastUpdated.getTime() < facilityDate.getTime()) {
                lastUpdated = facilityDate;
              }
            }
          });

          var dateOffset = lastUpdated.getTimezoneOffset();
          lastUpdated = Math.floor(lastUpdated.getTime() / 1000);
          lastUpdated += (-1) * dateOffset * 60;

          scope.lastUpdated = moment.unix(lastUpdated).format('LTS');
        };

        scope.getDataByDateRange = function (currentDimension) {
          scope.currentDimension = currentDimension;

          delete scope.socketRequest.data.year;
          delete scope.socketRequest.data.month;
          
          switch(currentDimension) {
            case 'week':
              scope.socketRequest.data.dateRange = 'week';
              break;
            case 'month':
              scope.socketRequest.data.dateRange = 'month';
              scope.socketRequest.data.month = scope.currentDate;
              scope.socketRequest.data.year = moment().year();
              break;
            case 'year':
              scope.socketRequest.data.dateRange = 'year';
              if(scope.currentDate !== moment().year()) {
                scope.socketRequest.data.year = scope.currentDate;
              }
              break;
            case 'total':
              scope.socketRequest.data.dateRange = 'total';
              break;
          }

          SocketIO.emit(scope.socketRequest.request, scope.socketRequest.data);
          
          scope.mainChart.loaded = false;
        };

        scope.changeDimension = function(dimension) {
          if(!dimension) {
            dimension = scope.currentDimension;
          }

          switch(dimension) {
            case 'week':
              scope.currentDate = $filter('date')(new Date(), 'w');
              scope.currentDateLabel = ''; //'Week ' + scope.currentDate;
              // scope.prevDateLabel = (scope.currentDate-1);
              // scope.nextDateLabel = (scope.currentDate+1);
              // angular.element('.date-range-nav .prev-nav').addClass('active');
              // angular.element('.date-range-nav .next-nav').addClass('active');
              scope.prevDateLabel = '';
              scope.nextDateLabel = '';
              angular.element('.date-range-nav .prev-nav').removeClass('active');
              angular.element('.date-range-nav .next-nav').removeClass('active');
              break;
            case 'month':
              scope.currentDate = moment().month();
              scope.currentDateLabel = moment().month(scope.currentDate).format('MMMM');
              scope.prevDateLabel = moment().month(scope.currentDate-1).format('MMMM');
              scope.nextDateLabel = moment().month(scope.currentDate+1).format('MMMM');
              if(scope.currentDate === 0) {
                angular.element('.date-range-nav .prev-nav').removeClass('active');
              }
              else {
                angular.element('.date-range-nav .prev-nav').addClass('active');
              }
              angular.element('.date-range-nav .next-nav').removeClass('active');
              
              break;
            case 'year':
              scope.currentDate = moment().year();
              scope.currentDateLabel = 'Year ' + scope.currentDate;
              scope.prevDateLabel = (scope.currentDate-1);
              scope.nextDateLabel = (scope.currentDate+1);
              angular.element('.date-range-nav .prev-nav').addClass('active');
              angular.element('.date-range-nav .next-nav').removeClass('active');
              break;
            case 'total':
              scope.currentDate = 0;
              scope.currentDateLabel = 'Total';
              scope.prevDateLabel = '';
              scope.nextDateLabel = '';
              angular.element('.date-range-nav .prev-nav').removeClass('active');
              angular.element('.date-range-nav .next-nav').removeClass('active');
              break;
              
          }

          scope.currentDimension = dimension;

          scope.getDataByDateRange(dimension);
        };

        scope.prevDate = function() {
          switch(scope.currentDimension) {
            case 'month':
              scope.currentDate = Math.max(scope.currentDate - 1, 0);
              scope.currentDateLabel = moment().month(scope.currentDate).format('MMMM');
              scope.prevDateLabel = moment().month(scope.currentDate-1).format('MMMM');
              scope.nextDateLabel = moment().month(scope.currentDate+1).format('MMMM');
              if(scope.currentDate === 0) {
                angular.element('.date-range-nav .prev-nav').removeClass('active');
              }
              else {
                angular.element('.date-range-nav .prev-nav').addClass('active');
              }
              angular.element('.date-range-nav .next-nav').addClass('active');
              break;
            case 'year':
              scope.currentDate = Math.max(scope.currentDate - 1, 2014);
              scope.currentDateLabel = 'Year ' + scope.currentDate;
              scope.prevDateLabel = (scope.currentDate-1);
              scope.nextDateLabel = (scope.currentDate+1);
              if(scope.currentDate === 2014) {
                angular.element('.date-range-nav .prev-nav').removeClass('active');
              }
              else {
                angular.element('.date-range-nav .prev-nav').addClass('active');
              }
              angular.element('.date-range-nav .next-nav').addClass('active');
              break;
          }

          scope.getDataByDateRange(scope.currentDimension);
        };

        scope.nextDate = function() {
          switch(scope.currentDimension) {
            case 'month':
              scope.currentDate = Math.min(scope.currentDate + 1, moment().month());
              scope.currentDateLabel = moment().month(scope.currentDate).format('MMMM');
              scope.prevDateLabel = moment().month(scope.currentDate-1).format('MMMM');
              scope.nextDateLabel = moment().month(scope.currentDate+1).format('MMMM');
              angular.element('.date-range-nav .prev-nav').addClass('active');
              if(scope.currentDate === moment().month()) {
                angular.element('.date-range-nav .next-nav').removeClass('active');
              }
              else {
                angular.element('.date-range-nav .next-nav').addClass('active');
              }
              break;
            case 'year':
              scope.currentDate = Math.min(scope.currentDate + 1, moment().year());
              scope.currentDateLabel = 'Year ' + scope.currentDate;
              scope.prevDateLabel = (scope.currentDate-1);
              scope.nextDateLabel = (scope.currentDate+1);
              if(scope.currentDate === moment().year()) {
                angular.element('.date-range-nav .next-nav').removeClass('active');
              }
              else {
                angular.element('.date-range-nav .next-nav').addClass('active');
              }
              angular.element('.date-range-nav .prev-nav').addClass('active');
              break;
          }
          
          scope.getDataByDateRange(scope.currentDimension);
        };

        scope.drawGraph = function() {

          var chartData = angular.copy(scope.mainChart);
          var newSeries = [], xLabels = [];
          var generationIndex = 0, savingsIndex = 0;
          var chartBottom = 0;

          var areaOptions = {
            type : 'areaspline',
            threshold : null,
            allowPointSelect: false,
            color: '#6b9e67',
            fillOpacity: '0.1',
            lineColor: '#6b9e67',
            trackByArea: false,
            stickyTracking: false,
            lineWidth: 2,
            marker: {
              enabled: false
            },
            yAxis: 1
          };

          var columnOptions = {
            type: 'column',
            color: '#ff7935',
            pointWidth: 8,
            borderWidth: 0,
            borderColor: null
          };

          var i=0;
          
          scope.weekDays = []; // Save week days to show day onetime when date range 'week'

          for(i=0; i<chartData.categories.length; i++) {
            xLabels.push(changeDateLabel(chartData.categories[i]));
          }

          for(i=0; i<chartData.series.length; i++) {
            if(chartData.series[i].name === 'Total Generation') {
              angular.extend(columnOptions, chartData.series[i]);
              generationIndex = i;
            }
            else if(chartData.series[i].name === 'Savings') {
              angular.extend(areaOptions, chartData.series[i]);
              savingsIndex = i;
            }
          }

          switch(scope.currentDimension) {
            case 'week':
              chartBottom = 80;
              break;
            case 'month':
              chartBottom = 30;
              break;
            case 'year':
              chartBottom = 30;
              break;
            case 'total':
              chartBottom = 70;
              break;
            default:
              chartBottom = 30;
              break;
          }

          newSeries.push(areaOptions);
          newSeries.push(columnOptions);
          
          $timeout(function() {
            scope.segMainChartConfig = {
              options: {
                chart: {
                  marginBottom: chartBottom,
                  spacingLeft: 0,
                  spacingRight: 10,
                  reflow: true,
                  style: {
                    fontFamily: 'HelveticaNeueW02-55Roma, Helvetica, Arial',
                    fontSize: '11px',
                    overflow: 'visible'
                  },
                  events: {
                    drilldown: function() {
                      return scope.detailElement();
                    },
                    click: function() {
                      return scope.detailElement();
                    },
                    load: function() {
                      scope.mainChart.loaded = true;
                    },
                    redraw: function() {
                      scope.mainChart.loaded = true;
                    }
                  }
                },
                plotOptions: {
                  series: {
                    events: {
                      drilldown: function() {
                        return scope.detailElement();
                      },
                      click: function() {
                        return scope.detailElement();
                      }
                    }
                  }
                },
                tooltip: {
                  useHTML: true,
                  borderColor: null,
                  borderWidth: 0,
                  borderRadius: 3,
                  shadow: false,
                  shape: 'callout',
                  spacing: [0,0,0,0],
                  shared: true,
                  backgroundColor: 'rgba(35, 43, 57, 0.9)',
                  style: {
                    padding: '20px',
                    whiteSpace: 'normal',
                    zIndex: '99999'
                  },
                  formatter: function () {
                    var pointX = this.point ? this.point.x : this.points[0].point.x;
                    
                    var colors = ['orange', 'blue', 'green'];
                    var tootipContents = '<div class="blue-box">' + 
                      '<h5 class="title">Power Generation<br/>'+ 
                        changeDateLabel(scope.mainChart.categories[pointX], true) +'</h5>' + 
                      '<p>Total Generation for all selected sources on ' +
                        changeDateLabel(scope.mainChart.categories[pointX], true) +
                        ' is  <span class="orange">' + 
                        $filter('number')(scope.mainChart.series[generationIndex].data[pointX], 2) +
                        ' kWh.</span><br/> Total Savings is <span class="green">$' + 
                        $filter('number')(scope.mainChart.series[savingsIndex].data[pointX], 2) +
                        '</span></p>';
                    if(scope.mainChart.series.length > 2) {
                      tootipContents += '<div class="row">' + 
                          '<div class="col-xs-12 text-right">' + 
                            '<span>' + changeDateLabel(scope.mainChart.categories[pointX], true) + '</span>' + 
                          '</div>' + 
                        '</div>';
                      for(var i=2; i<scope.mainChart.series.length; i++) {
                        if(i < 7) {
                          var sourceDetail = solarTagService.getSourceDetail(scope.mainChart.series[i].name);
                          tootipContents += '<div class="row">' + 
                            '<div class="col-xs-7">' + 
                              '<span class="wrap-text">' +
                              (sourceDetail ? sourceDetail.displayName : scope.mainChart.series[i].name) +
                              ':</span>' +
                            '</div>' + 
                            '<div class="col-xs-5 text-right">' + 
                              '<span class="' + colors[(i-2) % 3] + '">' + 
                                $filter('number')(scope.mainChart.series[i].data[pointX], 2) + 'kWh</span>' + 
                            '</div>' + 
                          '</div>';
                        }
                        if(i === 7){
                          tootipContents += '<div class="row"><div class="col-xs-8">More...</div></div>';
                        }
                      }
                    }
                    if(scope.lastUpdated) {
                      tootipContents += '<p class="bottom">Last update at ' + scope.lastUpdated + '.</p>';
                    }
                    tootipContents += '</div>';

                    return tootipContents;
                  }
                }
              },
              xAxis: [{
                categories: xLabels,
                lineColor: 'transparent'
              }],
              yAxis: [{
                title: null,
                opposite: true,
                labels: {
                  formatter: function() {
                    return $filter('number')(this.value) + ' kWh';
                  }
                },
                plotLines: [{
                  value: 0,
                  width: 1,
                  color: '#cccccc'
                }]
              }, {
                title: null,
                opposite: true,
                labels: {
                  formatter: function() {
                    return '$' + $filter('number')(this.value);
                  },
                  style: {color: '#6b9e67'}
                },
                offset: 80,
                plotLines: [{
                  value: 0,
                  width: 1,
                  color: '#cccccc'
                }],
                min: 0
              }],
              title: {
                text: ''
              },
              series: newSeries,
              loading: false,
              credits: {
                enabled: false
              }
            };
          }, 10);
        };

        function changeDateLabel(text, asDetail) {
          var unixDate = new Date(text), weekDay; 
          var dateOffset = unixDate.getTimezoneOffset();
          unixDate = Math.floor(unixDate.getTime() / 1000);
          unixDate += (-1) * dateOffset * 60;

          switch(scope.currentDimension) {
            case 'week':
              if(asDetail) {
                return moment.unix(unixDate).format('MMM D, h:m A');
              }
              else {
                weekDay = moment.unix(unixDate).format('MMM D');
                if(scope.weekDays.indexOf(weekDay) === -1) {
                  scope.weekDays.push(weekDay);
                  return moment.unix(unixDate).format('MMM D, h a');
                }
                else {
                  return moment.unix(unixDate).format('h a');
                }
              }
              break;
            case 'month':
              if(asDetail) {
                return moment.unix(unixDate).format('MMM D');
              }
              else {
                return moment.unix(unixDate).format('D');
              }
              break;
            case 'year':
              if(asDetail) {
                return moment.unix(unixDate).format('MMM, YYYY');
              }
              else {
                return moment.unix(unixDate).format('MMM');
              }
              break;
            case 'total':
              return moment.unix(unixDate).format('MMM D, YYYY');
            default:
              return text;
          }
        }
        
        //scope.assignValues();
      }

    };

}]);

'use strict';

angular.module('bl.analyze.solar.surface').controller('EnergyGenerationDrilldownCtrl', 
  ['$scope', '$modalInstance', '$timeout', '$filter', 'SocketIO', 'NgTableParams', 'SourceSelectionEventService', 
  'parentScope', 'solarTagService', 
  function($scope, $modalInstance, $timeout, $filter, SocketIO, NgTableParams, SourceSelectionEventService, 
    parentScope, solarTagService) {

    $scope.currentDimension = parentScope.currentDimension;
    $scope.currentTableDimension = parentScope.currentDimension;
    $scope.pieChartTotalValue = 0;

    $scope.currentDate = parentScope.currentDate;
    $scope.kpiData = {};
    
    $scope.candlestickChart = {
      'series': [],
      'chart' : {},
      'loaded': false
    };

    $scope.tableChart = {
      'data': [],
      'columns': (parentScope.kpiData.facilities)? parentScope.kpiData.facilities: [],
      'loaded': false
    };

    $scope.pieChart = {
      'data': (parentScope.pieData)? parentScope.pieData: [],
      'total': (parentScope.kpiData.totalEnergyProduction)? parentScope.kpiData.totalEnergyProduction: 0,
      'loaded': false
    };

    $scope.socketRequest = {
      candlestick: {
        request: 'assurf:getsolarenergygenerationdrilldown', 
        data: { 
          'dateRange': $scope.currentDimension,
          'year': $scope.currentDate
        }
      },
      table: {
        request: 'assurf:table', 
        data: { 
          'dateRange': $scope.currentTableDimension/*,
          'selectedFacilities': $scope.facilities,
          'selectedScopes': $scope.scopes*/
        }
      }
    };

    SocketIO.watch('assurf:solarenergygeneration', function(data) {
      $scope.assignPieValues(data);
    });

    SocketIO.watch('assurf:solarenergygenerationdrilldown', function(data) {
      $scope.assignCandlestickValues(data);
    });

    SocketIO.watch('assurf:table', function(data) {
      $scope.assignTableValues(data);
    });

    SourceSelectionEventService.listen(function (message, options) {
      $scope.candlestickChart.loaded = false;
      $scope.pieChart.loaded = false;
      $scope.tableChart.loaded = false;
      //$scope.socketRequest.table.data.selectedFacilities = options.facilities;
      //$scope.socketRequest.table.data.selectedScopes = options.scopes;
      //SocketIO.emit($scope.socketRequest.table.request, $scope.socketRequest.table.data);
    });

    $scope.assignPieValues = function (data) {
      $scope.pieChart.data = data.pie;
      $scope.pieChart.total = data.totalProduction;
      
      $scope.drawPie();
    };

    $scope.assignTableValues = function (data) {
      $scope.tableChart.data = data.table;
      $scope.tableChart.columns = [];
      angular.forEach(data.table[0].sources, function(value, name) {
        $scope.tableChart.columns.push({
          'name': name, 'value': value.kwh
        });
      });
      
      var dateKey;
      angular.forEach($scope.tableChart.data, function(row) {
        dateKey = new Date(row.date);
        row.dateKey = $filter('date')(dateKey, 'MMMM, yyyy');
      });

      $scope.drawTable();
    };

    $scope.assignCandlestickValues = function (data) {
      $scope.kpiData.totalEnergyProduction = data.totalProduction;
      $scope.kpiData.totalSavings = data.totalSaving;
      $scope.kpiData.facilities = [];
      angular.forEach(data.totalProductionBySources, function(value, name) {
        var sourceDetail = solarTagService.getSourceDetail(name);
        $scope.kpiData.facilities.push({
          'name': sourceDetail ? sourceDetail.displayName : name,
          'value': value
        });
      });
      
      $scope.candlestickChart.series = data.candlestick.series;
      
      $scope.drawCandlestickChart();
    };

    $scope.getDataByDateRange = function (chartType, currentDimension) {
      if(chartType === 'candlestick') {
        $scope.currentDimension = currentDimension;
        switch(currentDimension) {
          case 'year':
            
            if($scope.currentDate === moment().year()) {
              $scope.socketRequest.candlestick.data = {
                'dateRange': 'year'
              };
            }
            else {
              $scope.socketRequest.candlestick.data = {
                'year': $scope.currentDate
              };
            }
            break;
          case 'total':
            $scope.socketRequest.candlestick.data = {
              'dateRange': 'total'
            };
            break;
        }

        $scope.candlestickChart.loaded = false;
        SocketIO.emit($scope.socketRequest.candlestick.request, $scope.socketRequest.candlestick.data);
      }
    };

    $scope.changeDimension = function(dimension) {
      if(!dimension) {
        dimension = $scope.currentDimension;
      }

      switch(dimension) {
        case 'total':
          $scope.currentDate = 0;
          $scope.currentDateLabel = 'Total';
          break;
        case 'year': 
          $scope.currentDateLabel = 'Year ' + $scope.currentDate;
          break;
      }

      $scope.currentDimension = dimension;

      $scope.getDataByDateRange('candlestick', dimension);
    };
    /*
    $scope.prevDate = function() {
      switch($scope.currentDimension) {
        case 'year':
          $scope.currentDate = Math.max($scope.currentDate - 1, 2014);
          $scope.currentDateLabel = 'Year ' + $scope.currentDate;
          $scope.prevDateLabel = $scope.currentDate-1;
          $scope.nextDateLabel = $scope.currentDate+1;
          if($scope.currentDate === 2014) {
            angular.element('.date-range-nav .prev-nav').removeClass('active');
          }
          else {
            angular.element('.date-range-nav .prev-nav').addClass('active');
          }
          angular.element('.date-range-nav .next-nav').addClass('active');
          break;
      }

      $scope.getDataByDateRange('candlestick', $scope.currentDimension);
    };

    $scope.nextDate = function() {
      switch($scope.currentDimension) {
        case 'year':
          var currentDate = new Date();
          $scope.currentDate = Math.min($scope.currentDate + 1, currentDate.getFullYear());
          $scope.currentDateLabel = 'Year ' + $scope.currentDate;
          $scope.prevDateLabel = ($scope.currentDate-1);
          $scope.nextDateLabel = ($scope.currentDate+1);
          
          if($scope.currentDate === currentDate.getFullYear()) {
            angular.element('.date-range-nav .next-nav').removeClass('active');
          }
          else {
            angular.element('.date-range-nav .next-nav').addClass('active');
          }
          angular.element('.date-range-nav .prev-nav').addClass('active');
          break;
      }
      
      $scope.getDataByDateRange('candlestick', $scope.currentDimension);
    };

    $scope.changeTableDimension = function(dimension) {

      if(!dimension) {
        dimension = $scope.currentTableDimension;
      }
      
      $scope.getDataByDateRange('table', dimension);
    };
    */
    $scope.drawCandlestickChart = function() {
      var chartData = $scope.candlestickChart.series;
      if($scope.candlestickChart.loaded) {
        $scope.candlestickChart.chart.highcharts().series[0].update({
          data: getCandlestickData(chartData.data)
        });
      }
      else {
        var chartHeight = $scope.getResponsiveChartHeight();
        $scope.candlestickChart.chart = $('#candlestickChart').highcharts('StockChart', {
          
          chart: {
            marginBottom: 60,
            marginRight: 60,
            spacingLeft: 0,
            spacingRight: 0,
            reflow: true,
            panning: false,
            height: chartHeight,
            zoomType: '',
            style: {
              fontFamily: 'HelveticaNeueW02-55Roma, Helvetica, Arial',
              fontSize: '11px',
              overflow: 'visible'
            },
            events: {
              load: function() {
                $scope.candlestickChart.loaded = true;
              },
              redraw: function() {
                $scope.candlestickChart.loaded = true;
              } 
            }
          },
          navigator : {
            enabled : false
          },
          navigation : {
            buttonOptions : {
              enabled : false
            }
          },
          scrollbar : {
            enabled : false
          },
          rangeSelector : {
            enabled : false
          },
          xAxis: {
            lineColor: 'transparent',
            labels: {
              formatter: function() {
                return changeDateLabel(this.value);
              }
            },
            startOnTick: true,
            tickPositioner: function() {
              var positions = [];
              angular.forEach(chartData.data, function(row) {
                positions.push(row.timestamp);
              });
                
              return positions;
            }
          },
          yAxis: {
            title: null,
            opposite: true,
            offset: 50,
            labels: {
              formatter: function() {
                return $filter('number')(this.value) + ' kWh';
              }
            },
            plotLines: [{
              value: 0,
              width: 1,
              color: '#cccccc'
            }],
            min: 0
          },      
          title : {
            text : ''
          },
          series : [{
            type : 'candlestick',
            name : 'Energy',
            color: 'rgba(255, 121, 64, 0.9)',
            lineColor: 'rgba(254, 189, 159, 0.9)',
            upColor: 'rgba(254, 189, 159, 0.9)',
            states: {
              hover: {
                enabled : false
              }
            },
            data : getCandlestickData(chartData.data),
            dataGrouping : {
              enabled: false
            }
          }],
          loading: false,
          credits: {
            enabled: false
          },
          tooltip: {
            useHTML: true,
            borderColor: null,
            borderWidth: 0,
            borderRadius: 3,
            shadow: false,
            spacing: [0,0,0,0],
            backgroundColor: 'rgba(35, 43, 57, 0.9)',
            style: {
              padding: '20px',
              whiteSpace: 'normal'
            },
            formatter: function () {
              var colors = ['orange', 'blue', 'green'];
              var minTime = getPointTime(this.points[0].point.index, 'minimum');
              var maxTime = getPointTime(this.points[0].point.index, 'maximum');
              var tootipContents = '<div class="blue-box">' + 
                '<h5 class="title">Power Generation for the Month<br/>' + changeDateLabel(this.x, true) + '</h5>' + 
                '<div class="row">' + 
                  '<div class="col-xs-6">' + 
                    '<span>'+ changeDateLabel(this.x, true, 'initial') + ' :</span>' + 
                  '</div>' + 
                  '<div class="col-xs-6 text-right">' + 
                    '<span class="' + colors[0] + '">' + 
                      $filter('number')(this.points[0].point.open, 2) + 'kWh</span>' + 
                  '</div>' + 
                '</div>' +
                '<div class="row">' + 
                  '<div class="col-xs-6">' + 
                    '<span>Min Day : '+ changeDateLabel(minTime, true, 'minimum') + '</span>' + 
                  '</div>' + 
                  '<div class="col-xs-6 text-right">' + 
                    '<span class="' + colors[2] + '">' + 
                      $filter('number')(this.points[0].point.low, 2) + 'kWh</span>' + 
                  '</div>' + 
                '</div>' +
                '<div class="row">' + 
                  '<div class="col-xs-6">' + 
                    '<span>Max Day : '+ changeDateLabel(maxTime, true, 'maximum') + '</span>' + 
                  '</div>' + 
                  '<div class="col-xs-6 text-right">' + 
                    '<span class="' + colors[1] + '">' + 
                      $filter('number')(this.points[0].point.high, 2) + 'kWh</span>' + 
                  '</div>' + 
                '</div>' +
                '<div class="row">' + 
                  '<div class="col-xs-6">' + 
                    '<span>'+ changeDateLabel(this.x, true, 'final') + ' :</span>' + 
                  '</div>' + 
                  '<div class="col-xs-6 text-right">' + 
                    '<span class="' + colors[0] + '">' + 
                      $filter('number')(this.points[0].point.close, 2) + 'kWh</span>' + 
                  '</div>' + 
                '</div>' +
              '</div>';

              return tootipContents;
            }
          }
          
        });
        
      }

    };
    
    $scope.drawTable = function() {
      
      if($scope.tableChart && $scope.tableChart.param) {
        $scope.tableChart.loaded = true;
      }
      
      if($scope.tableChart.loaded) {
        $scope.tableChart.param.parameters({
          page: 1,
          count: $scope.tableChart.data.length
        }, true);

        $scope.tableChart.param.settings({
          counts: [],
          total: 1,
          getData: function ($defer, params) {
            $defer.resolve($scope.tableChart.data.slice((params.page() - 1) * params.count(),
              params.page() * params.count()));
          }
        });

        $timeout(function() {
          //$scope.tableChart.data = tableChart.data;
          //$scope.tableChart.columns = tableChart.columns;
          
          $scope.tableChart.param.reload();
        }, 100);
      }
      else {
        //$scope.tableChart = tableChart;
        $scope.tableChart.param = new NgTableParams({
          page: 1,
          count: $scope.tableChart.data.length
        }, {
          counts: [],
          total: 1,
          getData: function ($defer, params) {
            $defer.resolve($scope.tableChart.data.slice((params.page() - 1) * params.count(),
              params.page() * params.count()));
          }
        });

        $scope.tableChart.loaded = true;
      }
    };

    $scope.drawPie = function() {
      var pieData = $scope.pieChart.data;
  		var colors = ['#c8c8c8', '#ff7940', '#fda278', '#febd9f'];
  		var dataSeries = [];
  		var dataTotal = [];

      var tmpData = {};

      for(var i=0; i<pieData.series[0].data.length; i++) {
      	tmpData = {};

      	tmpData.name = pieData.series[0].data[i][0];
      	tmpData.y = pieData.series[0].data[i][1];
      	tmpData.color = colors[i];
        
      	dataSeries.push(tmpData);
      }

      tmpData = {};
    	tmpData.name = 'Total kWh';
    	tmpData.y = $scope.pieChart.total;
    	tmpData.color = '#ffffff';
    	
    	dataTotal.push(tmpData);

      var totalHeight = $(window).height() + $(window).scrollTop();
      var elementOffsetTop = 500; // offset top of table
      var pieHeight = totalHeight - elementOffsetTop - 10;

      $timeout(function() {

        $scope.gpsPieChartConfig = {
      		options: {
            chart: {
              plotBackgroundColor: null,
              plotBorderWidth: null,
              plotShadow: false,
              borderWidth: 0,
              borderColor: null,
              reflow: true,
              height: pieHeight,
              events: {
                load: function() {
                  $scope.pieChart.loaded = true;
                },
                redraw: function() {
                  $scope.pieChart.loaded = true;
                } 
              },
              style: {
                fontFamily: 'HelveticaNeueW02-55Roma, Helvetica, Arial',
                fontSize: '11px'
              }
            },
            plotOptions: {
              pie: {
                shadow: false,
                center: ['50%', '50%'],
                allowPointSelect: false,
                dataLabels: {
                  useHTML: true
                }
              }
            },
            title: {
              text: ''
            },
      			tooltip: {
              enabled: false,
              useHTML: true,
              borderColor: null,
              borderWidth: 0,
              borderRadius: 3,
              shadow: false,
              spacing: [0,0,0,0],
              backgroundColor: 'rgba(35, 43, 57, 0.9)',
              style: {
                padding: '20px',
                color: '#ffffff',
                whiteSpace: 'normal',
              }
            }
          },
          series: [{
            type: 'pie',
            name: 'Total kWh',
            data: dataTotal,
            size: 120,
            dataLabels: {
              formatter: function () {
                return '<div class="pie-datalabel-total"><b class="value">' + 
                  $filter('number')(this.y, 1) + '</b><br /><span>kWh Total</span></div>';
              },
              verticalAlign: 'middle',
              inside: true,
              overflow: 'justify',
              x: 0,
              distance: -80
            },
           	tooltip: {
            	pointFormat: '<b>{point.y:.1f} kWh</b>'
            }
          },{
          	type: 'pie',
            data: dataSeries,
        		innerSize: 120,
            size: 180,
            dataLabels: {
              formatter: function () {
                var sourceDetail = solarTagService.getSourceDetail(this.point.name);
                return '<div class="pie-datalabel-point">' +
                  sourceDetail ? sourceDetail.displayName : this.point.name + '<br />' +
                  '<b class="value">' + $filter('number')(this.y, 1) + '%</b></div>';
              },
              crop: false,
              connectorColor: '#cccccc'
            },
           	tooltip: {
              pointFormat: '<b>{point.y:.1f}%</b>'
            }
          }],
          loading: false,
          credits: {
            enabled: false
          }
  	    };

      }, 10);
      
    };

    $scope.init = function() {
      $timeout(function() {
        if($scope.currentDimension !== 'total' && $scope.currentDimension !== 'year') {
          $scope.currentDimension = 'year';
          $scope.currentDate = moment().year();
        }
        $scope.changeDimension($scope.currentDimension);

        if(!$scope.pieChart.loaded && $scope.pieChart.data.series && $scope.pieChart.data.series.length > 0) {
          $scope.drawPie();
        }
      }, 10);
    };
    
    $scope.closeDrilldown = function () {
      $modalInstance.dismiss('cancel');
    };

    $scope.getResponsiveChartHeight = function () {
      var windowHeight = $(window).height();
      var chartHeight = 260;
      if(windowHeight > 911) {
        chartHeight += windowHeight - 915;
      }
      return chartHeight;
    };

    $scope.init();

    $(window).resize(function(){
      var chartHeight = $scope.getResponsiveChartHeight();
      var chartWidth = $('#candlestickChart').width();
      var chart = $scope.candlestickChart.chart.highcharts();
      if((chart !== null) && (typeof chart !== 'undefined')) {
        chart.setSize(chartWidth, chartHeight, true);
      }
    });

    function changeDateLabel(timestamp, asDetail, detail) {
      var unixDate = new Date(timestamp);
      var dateOffset = unixDate.getTimezoneOffset();
      unixDate = Math.floor(timestamp / 1000);
      unixDate += dateOffset * 60; // get UTC time 
      
      if(asDetail) {
        switch(detail) {
          case 'initial':
            return moment.unix(unixDate).startOf('month').format('MMMM Do');
          case 'minimum':
            return moment.unix(unixDate).format('MMMM Do');
          case 'maximum':
            return moment.unix(unixDate).format('MMMM Do');
          case 'final':
            return moment.unix(unixDate).endOf('month').format('MMMM Do');
          default:
            return moment.unix(unixDate).format('MMMM, YYYY');
        }
      }
      else {
        return moment.unix(unixDate).format('MMM, YYYY');
      }
    }

    function getCandlestickData(data) {
      var candlestickData = [], candlestickRow = [];

      angular.forEach(data, function(row) {
        candlestickRow = [
          row.timestamp,
          row.initial,
          row.maximum,
          row.minimum,
          row.final
        ];

        candlestickData.push(candlestickRow);
      });

      return candlestickData;
    }

    function getPointTime(index, detail) {
      var row = $scope.candlestickChart.series.data[index];
      
      if(row && row !== undefined) {
        if(detail === 'minimum') {
          return row.minimumTimestamp;
        }
        else if(detail === 'maximum') {
          return row.maximumTimestamp;
        }
      }
    }

}]);

'use strict';

angular.module('bl.analyze.solar.surface')

.controller('ElementEquivalenciesController',
  ['$scope', '$filter', 'equivalenciesService', 'SourceSelectionEventService', 'asDateRangeSelectorConfig',
  function ($scope, $filter, equivalenciesService, SourceSelectionEventService, asDateRangeSelectorConfig) {
    $scope.isDataLoaded = false;
    $scope.dateRange = 'month';
    $scope.lastEquiv = {
      'carsRemoved': 0.0,
      'homePowered': 0.0,
      'seedlingsGrown': 0,
      'refrigerators': 0,
      'mobilePhones': 0,
      'batteries': 0,
      'avoidedCarbon': 0,
      'gallonsGas': 0,
      'tankersGas': 0,
      'railroadCarsCoal': 0,
      'barrelsOil': 0,
      'propaneCylinders': 0,
      'powerPlants': 0,
      'kwh': 0
    };

    $scope.$watch('dateRange', function (newVal, oldVal) {
      if (newVal !== oldVal) {
        $scope.isDataLoaded = false;
        equivalenciesService.emitEquivalencies(newVal);
      }

      if (newVal === 'total') {
        $scope.dateRangeLabels = '';
      } else {
        $scope.dateRangeLabels = ' in the past ' + asDateRangeSelectorConfig.labels[newVal].toLowerCase();
      }
    });

    $scope.watchEquiv = function () {
      equivalenciesService.watchEquivalencies(function (equiv) {
        $scope.lastEquiv = equiv;
        $scope.isDataLoaded = true;
      });
    };


    SourceSelectionEventService.listen(function () {
      $scope.isDataLoaded = false;
    });
    $scope.watchEquiv();
  }])
  .directive('elementEquivalencies', ['$modal', function($modal) {
    var openDrilldown = function (lastEquiv) {
      return $modal.open({
        templateUrl: 'app/elements/equivalencies/drilldown.html',
        controller: 'EquivalenciesDrilldownController',
        windowClass: 'drilldown',
        size: 'lg',
        resolve: {
          'lastEquiv': function () {
            return lastEquiv;
          }
        }
      });
    };

    return {
      restrict: 'E',
      templateUrl: 'app/elements/equivalencies/template.html',
      controller: 'ElementEquivalenciesController',
      replace: true,
      scope: true,
      link : function (scope, element, attrs) {
        element.on('click', '.content', function () {
          openDrilldown(scope.lastEquiv);
        });
      }
    };
  }]);
'use strict';

angular.module('bl.analyze.solar.surface')

.controller('EquivalenciesDrilldownController',
  ['$scope', '$modalInstance', 'lastEquiv', 'equivalenciesService', 'SourceSelectionEventService',
  function ($scope, $modalInstance, lastEquiv, equivalenciesService, SourceSelectionEventService) {
    $scope.isDataLoaded = true;
    $scope.lastEquiv = lastEquiv;

    $scope.closeDrilldown = function () {
      $modalInstance.dismiss('cancel');
    };

    SourceSelectionEventService.listen(function () {
      $scope.isDataLoaded = false;
    });
  }
]);
'use strict';

angular.module('bl.analyze.solar.surface')

  .constant('rtpPrimaryChartConfig', {
    credits: { enabled: false },
    chart: {
      type: 'spline',
      height: 330,
      marginTop: 25,
      marginBottom: 60
    },
    plotOptions: {series:{marker:{enabled: false}}},
    exporting: {enabled: false},
    tooltip: {
      valueSuffix: 'kW', backgroundColor: 'rgba(35,43,57,0.9)',
      borderRadius: 3, borderWidth: 0,
      shadow: false, shared: true, useHTML: true,
      crosshairs: { width: 2, color: 'gray', dashStyle: 'shortdot' }
    },
    yAxis: [{
      title: { text: '' }, labels: { formatter: function(){ return this.value + 'kW'; }},
      opposite: true, min: 0, plotLines: [{ value: 0, width: 0, color: '#808080'}]
    }, {
      gridLineWidth: 0, lineWidth: 0, lineColor: '#cccccc', title: { text: '' }
    }
    ]
  })

  .controller('elementRTPController',
  ['$scope', '$interpolate', '$filter', '$modal', 'powerService', 'rtpPrimaryChartConfig', 'energyService',
   'solarTagService', 'SourceSelectionEventService',
    function ($scope, $interpolate, $filter, $modal, powerService, rtpPrimaryChartConfig, energyService,
     solarTagService, SourceSelectionEventService) {
      $scope.isDataLoaded = false;
      $scope.dateRange = 'month';
      $scope.noDataRTP = false;
      $scope.lastRTPower = {
      };

      SourceSelectionEventService.listen(function () {
        $scope.isDataLoaded = false;
      });

      $scope.primaryChart = {
        options: rtpPrimaryChartConfig,
        series: [],
        xAxis: {
          /*startOnTick: true,
          endOnTick: true,*/ /* Do not uncomment this */
          labels: {
            formatter: function () {
              var format;
              if ($scope.dateRange === 'today') {
                format = 'h:mma';
              } else if ($scope.dateRange === 'week') {
                format = 'MMM D ha';
              } else {
                format = 'MMM D';
              }
              return $filter('amDateFormat')(this.value, format);
            }
          }
        }
      };

      $scope.primaryChart.options.chart.events = {
        click: function () {$scope.openDrilldown();},
        drilldown: function () {$scope.openDrilldown();}
      };

      $scope.$watch('dateRange', function(newVal,oldVal) {
        if (newVal !== oldVal) {
          $scope.isDataLoaded = false;
          powerService.emitRTPower(newVal);
        }
      });

      $scope.primaryChart.options.tooltip.formatter = function () {
        var points = this.points,
          totalPower = 0;

        var datapoints = points.map(function (point) {
          if (point.series.name === 'Total Generation') {
            return [
              '<p>',
              '<span class="info-key">' + point.series.name + '</span>',
              '<span class="info-value" style="color:' + point.point.color + '">{{ totalPower }}kW</span>',
              '</p>'
            ].join('');
          } else {
            totalPower += Number(point.y.toFixed(1));
            return [
              '<p>',
              '<span class="info-key">' + point.series.name + '</span>',
              '<span class="info-value" style="color:' + point.point.color + '">' + point.y.toFixed(1) + 'kW</span>',
              '</p>'
            ].join('');
          }
        });

        var theDayFormat = 'MMM D, h:mma',
          theTimeFormat = 'h:mma';

        if ($scope.dateRange === 'month') {
          theDayFormat = 'MMM D';
          theTimeFormat = '';
        } else if ($scope.dateRange === 'week') {
          theDayFormat = 'MMM D ha';
          theTimeFormat = 'ha';
        }

        var tooltipObject = {
          theDay: $filter('amDateFormat')(this.x, theDayFormat),
          theTime: theTimeFormat ? $filter('amDateFormat')(this.x, theTimeFormat) : '',
          totalPower: totalPower.toFixed(1),
          lastUpdatedTime: $filter('amCalendar')($scope.lastRTPower.lastUpdatedTime).toLowerCase()
        };

        if ($scope.dateRange === 'today') {
          tooltipObject.lastUpdatedTime = $filter('amCalendar')
                  ($scope.lastRTPower.primary['x-axis'][$scope.lastRTPower.primary['x-axis'].length - 1]).toLowerCase();
        }

        var tooltipString = [
          '<div class="info rtp-infopanel"><div class="blue-box"><div class="info-title">Power Generation</div>',
          '<div class="info-title">{{ theDay }}</div><br/>',
          '<p>Total Generation for all selected sources {{ theTime }} is ',
          '<span class="kpi-info">{{ totalPower }}kW</span>.</p>',
          '<div class="info-table">', datapoints.slice(0, 5).join(''),
          datapoints.length > 5 ? '<p>More...</p>' : '',
          '</div>',
          '<p>Last update {{ lastUpdatedTime }}</p></div></div>'
        ].join('');

        return $interpolate(tooltipString)(tooltipObject);
      };

      $scope.startWatchPower = function () {
        powerService.watchRTPower(function (RTPower) {
          $scope.lastRTPower = RTPower;
          $scope.updatePrimaryChart(RTPower.primary);
          $scope.isDataLoaded = true;
        });
      };

      $scope.updatePrimaryChart = function (chartData) {
        $scope.noDataRTP = !chartData['xAxis'].length;

        angular.extend($scope.primaryChart, {
          series: chartData['datapoints'],
          xAxis: { categories: chartData['xAxis'] }
        });
      };

      var lastTED;
      energyService.watchEnergyDrillDown(function (response) {
        lastTED = response;
      });

      $scope.openDrilldown = function () {
        $modal.open({
          templateUrl: 'app/elements/realtime-power/drilldown.html',
          controller: 'EnergyDrilldownController',
          windowClass: 'drilldown',
          size: 'lg',
          resolve: {
            lastTEDData: function () {
              return lastTED;
            }
          }
        });
      };

      $scope.startWatchPower();
    }
  ])

  .directive('elementRealtimePower', function() {
    return {
      restrict: 'E',
      scope: true,
      controller: 'elementRTPController',
      templateUrl: 'app/elements/realtime-power/template.html',
      link : function (scope, element, attrs) {

      }
    };
  });

'use strict';

angular.module('bl.analyze.solar.surface')
  .constant('energyDrillDownChartConfig', {
    credits: {enabled: false},
    chart: {
      height: 740,
      marginTop: 25,
      marginBottom: 80,
      marginRight: 120
    },
    title: {text: null},
    plotOptions: {series: {marker: {enabled: false}}},
    exporting: {enabled: false},
    colors: ['#ff7935', '#6b9e67'],
    tooltip: {
      valueSuffix: 'kW', backgroundColor: 'rgba(35,43,57,0.9)',
      style: {color: '#fff'},
      borderRadius: 3, borderWidth: 0,
      shadow: false, shared: false, useHTML: true
    },
    legend: {enabled:false},
    xAxis: [{
      type: 'datetime'
    }, {
      type: 'datetime', opposite: true, lineWidth: 0, minorGridLineWidth: 0,lineColor: 'transparent',
      labels: {enabled: false}, minorTickLength: 0,tickLength: 0
    }],
    yAxis: [{
      title: {text: null}, labels: {format: '{value}kW', style: {color: '#6b9e67'}},
      min: 0, lineWidth: 0, opposite: true
    }, {
      title: {text: null}, labels: {format: '{value}kWh', style: {color: '#ff7935'}},
      min: 0, gridLineWidth: 0, lineWidth: 0, opposite: true
    }]
  })

  .controller('EnergyDrilldownController',
  ['$scope', '$timeout', '$modalInstance', '$filter', '$interpolate', 
    'energyService', 'lastTEDData', 'energyDrillDownChartConfig', 'solarTagService',
    function ($scope, $timeout, $modalInstance, $filter, $interpolate,
              energyService, lastTEDData, energyDrillDownChartConfig, solarTagService) {
      $scope.isDataLoaded = false;
      $scope.kpiData = {};
      $scope.chartConfig = angular.extend(energyDrillDownChartConfig, {
        series: []
      });

      $scope.chartConfig.xAxis[0].labels = {
        formatter : function () {
          return $filter('amDateFormat')(this.value / 1000, 'ha');
        }
      };

      $scope.chartConfig.tooltip.formatter = function () {
        var tooltipObject = {
          theDateTime: $filter('amDateFormat')(this.key / 1000, 'MMM D, h:mma'),
          infoLabel: this.series.name,
          infoValue: $filter('number')(this.y, 1),
          infoUnit: this.series.name === 'Energy Generated' ? 'kWh' : 'kW',
          infoColor: this.series.color
        };

        var tooltipString = [
          '<p>{{ theDateTime }}</p>',
          '<p class="no-margin">{{ infoLabel }}: &nbsp;&nbsp; ',
          '<span style="color: {{ infoColor }};">{{ infoValue }}{{ infoUnit }}</span></p>'/*,
          '<p>Last update {{ lastUpdatedTime }}</p></div></div>'*/
        ].join('');

        return $interpolate(tooltipString)(tooltipObject);
      };

      $scope.loadDrilldown = function (tedData) {
        $scope.kpiData = tedData.kpi;
        angular.extend($scope.chartConfig, {
          series: [
            angular.extend(tedData.chart.energy, {color: '#ff7935',type: 'column',yAxis: 1}),
            angular.extend(tedData.chart.power, {color: '#6b9e67',type: 'spline',xAxis: 1})
          ]
        });
        $timeout(function () {
          $scope.chartConfig.chart.height = $scope.getResponsiveChartHeight();
          $('#energy-drilldown-combochart').highcharts($scope.chartConfig);
        }, 50);

        $scope.isDataLoaded = true;
      };

      $scope.startWatchDrilldown = function () {
        energyService.watchEnergyDrillDown(function (tedData) {
          $scope.loadDrilldown(tedData);
        });
      };

      $scope.closeDrilldown = function () {
        $modalInstance.dismiss('cancel');
      };

      $scope.getResponsiveChartHeight = function () {
        var windowHeight = $(window).height();
        var chartHeight = 740;
        if(windowHeight > 898) {
          chartHeight += windowHeight - 904;
        }
        return chartHeight;
      };

      $(window).resize(function(){
        var chartHeight = $scope.getResponsiveChartHeight();
        var chartWidth = $('#energy-drilldown-combochart').width();
        var chart = $('#energy-drilldown-combochart').highcharts();
        if((chart !== null) && (typeof chart !== 'undefined')) {
          chart.setSize(chartWidth, chartHeight, true);
        }
      });

      if (lastTEDData) {
        $scope.loadDrilldown(lastTEDData);
      }
    }
  ]);
'use strict';

angular.module('bl.analyze.solar.surface')
  .controller('ElementAvoidedCarbonController',
    ['$scope', '$filter', '$interpolate', 'equivalenciesService', 'SourceSelectionEventService',
    function ($scope, $filter, $interpolate, equivalenciesService, SourceSelectionEventService) {
      $scope.isDataLoaded = false;
      $scope.dateRange = 'month';
      $scope.lastCarbonAvoided =  {
        carbonAvoided: 0,
        carbonAvoidedTotal: 0
      };
      $scope.lastEquiv = null;

      var iPanelTextSrc = 'Your system avoided <span class="orange">{{ Carbon }}lbs</span> of carbon {{ dateRange }}.';
      $scope.infoPanelText = iPanelTextSrc;

      $scope.$watch('dateRange', function (newVal, oldVal) {
        if (newVal !== oldVal) {
          $scope.isDataLoaded = false;
          equivalenciesService.emitCarbonAvoided(newVal);
        }
      });

      $scope.watchCarbon = function () {
        equivalenciesService
          .watchCarbonAvoided(function (CA) {
            $scope.lastCarbonAvoided = CA;
            $scope.infoPanelText = $interpolate(iPanelTextSrc)({
              Carbon: $filter('number')(CA.carbonAvoided, 0),
              dateRange: $scope.dateRange === 'total' ? 'as total' : 'over the last ' + $scope.dateRange
            });
            $scope.isDataLoaded = true;
          })
          .watchEquivalencies(function (equiv) {
            $scope.lastEquiv = equiv;
          });
      };

      SourceSelectionEventService.listen(function (event, selectedSources) {
        $scope.isDataLoaded = false;
      });

      $scope.watchCarbon();
    }
  ])
  .directive('elementAvoidedCarbon', ['$q', '$modal',
    function($q, $modal) {
      var openDrilldown = function (lastEquiv) {
        return $modal.open({
          templateUrl: 'app/elements/equivalencies/drilldown.html',
          controller: 'EquivalenciesDrilldownController',
          windowClass: 'drilldown',
          size: 'lg',
          resolve: {
            'lastEquiv': function () {
              return lastEquiv;
            }
          }
        });
      };

      return {
        restrict: 'E',
        templateUrl: 'app/elements/avoided-carbon/template.html',
        transclude: true,
        scope: true,
        controller: 'ElementAvoidedCarbonController',
        replace: true,
        link : function (scope, element, attrs) {
          element.on('click', '.content', function () {
            openDrilldown(scope.lastEquiv);
          });
        }
      };
    }
  ]);
'use strict';

angular.module('bl.analyze.solar.surface')
  .directive('elementAnnualEnergyGenerationComparision', 
    ['$compile', '$modal', '$timeout', '$filter', 'SocketIO', 'SourceSelectionEventService', 
  	function($compile, $modal, $timeout, $filter, SocketIO, SourceSelectionEventService) {
      return {
        restrict: 'E',
        scope: true,
        templateUrl: 'app/elements/annual-comparison/template.html',
        link : function (scope, element, attrs, controller) {
          var data = {'message':{'category':[], 'series':[]}};
          var ytdData = {'curYtd':[], 'curYtdDollar':[], 'prevYtd':[], 'prevYtdDollar':[]};

          scope.isDataLoaded = false;
          SocketIO.watch('assurf:yieldcomparator', function(response) {
            data.message = response;
            var prevYtd = 0, curYtd = 0, curYtdDollar = 0, prevYtdDollar;
            angular.forEach(response.series[0].data, function(value, key){
              curYtd += value;
              prevYtd += response.series[2].data[key];
              curYtdDollar += response.series[1].data[key];
              prevYtdDollar += response.series[3].data[key];
              ytdData.curYtd.push(curYtd);
              ytdData.curYtdDollar.push(curYtdDollar);
              ytdData.prevYtd.push(prevYtd);
              ytdData.prevYtdDollar.push(prevYtdDollar);
            });
            scope.drawGraph();
            scope.isDataLoaded = true;
          });

          scope.init = function() {
            scope.socketRequest = {
              request: 'assurf:getyieldcomparator',
              data: {}
            };
            /*SocketIO.emit(scope.socketRequest.request, scope.socketRequest.data);*/
          };

          scope.drawGraph = function() {

            var tmpDataA = {}, tmpDataB = {}, newSeries = [];

            for(var i=0; i<data.message.series.length; i++) {
              if(data.message.series[i].name === 'current') {
                tmpDataA = angular.copy(data.message.series[i]);
                tmpDataA.type = 'column';
                tmpDataA.color = '#ff6d2d';
                tmpDataA.yAxis = 0;
                tmpDataA.pointWidth = 8;
                newSeries.push(tmpDataA);
              } else if(data.message.series[i].name === 'previous') {
                tmpDataA = angular.copy(data.message.series[i]);
                tmpDataA.type = 'column';
                tmpDataA.color = '#CCCCCC';
                tmpDataA.allowPointSelect = false;
                tmpDataA.yAxis = 0;
                tmpDataA.pointWidth = 8;
                newSeries.push(tmpDataA);
              } else if (data.message.series[i].name === 'mean') {
                tmpDataB = angular.copy(data.message.series[i]);
                tmpDataB.type = 'spline';
                tmpDataB.color = '#6b9e67';
                tmpDataB.lineColor = '#6b9e67';
                tmpDataB.lineWidth = 0.6;
                tmpDataB.allowPointSelect = false;
                tmpDataB.yAxis = 0;
                tmpDataB.marker = {enabled: false};
                newSeries.push(tmpDataB);
              }
            }

            $timeout(function() {
              scope.comboChartConfig = {
                options: {
                  chart: {
                    marginBottom: 40,
                    spacingLeft: 0,
                    spacingRight: 12,
                    style: {
                      fontFamily: 'HelveticaNeueW02-55Roma, Helvetica, Arial',
                      fontSize: '10px',
                      overflow: 'visible'
                    }
                  },
                  tooltip: {
                    useHTML: true,
                    borderColor: null,
                    borderWidth: 0,
                    borderRadius: 3,
                    shadow: false,
                    spacing: [0,0,0,0],
                    backgroundColor: 'rgba(35, 43, 57, 0.9)',
                    shared: true,
                    style: {
                      color: '#FFFFFF',
                      fontSize: '11px',
                      padding: '20px',
                      fontFamily: 'HelveticaNeueW02-55Roma',
                      whiteSpace: 'normal',
                      zIndex: '99999'
                    },
                    positioner: function(labelWidth, labelHeight, point) {
                      var w = $(window).width(); 
                      var h = $(window).height() + $(window).scrollTop();
                      var offset = $('#annualComboChart').offset();
                      
                      var position = {x:0, y:0};
                      position.x = w - offset.left - this.chart.plotLeft - labelWidth - 10;
                      position.y = h - offset.top - this.chart.plotTop - labelHeight - 10;

                      position.x = (point.plotX + 10) > position.x ? 
                        (point.plotX - labelWidth - 10) : (point.plotX + 10);
                      position.y = (point.plotY - 20) > position.y ? position.y : (point.plotY - 20);

                      if(position.x < 0) {
                        position.x = 0;
                      }

                      return position;
                    },
                    formatter: function () {
                      var pointX = this.point ? this.point.x : this.points[0].point.x;
                      var categories = data.message.category;

                      var curKWH = data.message.series[0].data[pointX] ? 
                        data.message.series[0].data[pointX].toFixed(0) : 0;
                      var curDollar = data.message.series[1].data[pointX] ? 
                        data.message.series[1].data[pointX].toFixed(0) : 0;
                      var prevKWH = data.message.series[2].data[pointX] ? 
                        data.message.series[2].data[pointX].toFixed(0) : 0;
                      var prevDollar = data.message.series[3].data[pointX] ? 
                        data.message.series[3].data[pointX].toFixed(0) : 0;
                      var curYtd = (ytdData.curYtd[pointX]).toFixed(0);
                      var curYtdDollar = (ytdData.curYtdDollar[pointX]).toFixed(0);
                      var prevYtd = (ytdData.prevYtd[pointX]).toFixed(0);
                      var compareLabel = (parseInt(curKWH) > parseInt(prevKWH)) ? 'greater' : 'less';
                      var compareLabelYtd = (parseInt(curYtd) > parseInt(prevYtd)) ? 'greater' : 'less';
                      var compareKWH = 0, compareYtd = 0;
                      var ratio = 0, ratioYtd = 0;
                      var curYear = $filter('date')(new Date(), 'yyyy');
                      var prevYear = curYear - 1;
                      var tooltipContents = '' + 
                        '<p class="heading"><span>' + categories[pointX] + ' ' + curYear + 
                          ': </span>' + '<span class="orange">' + $filter('number')(curKWH) + ' kWh / $' + 
                          $filter('number')(curDollar) + '</span><br/>' + 
                          '<span>' + categories[pointX] + ' ' + prevYear + ': </span>' + 
                          '<span class="orange">' + $filter('number')(prevKWH) + ' kWh / $' + 
                          $filter('number')(prevDollar) + '</span></p>';

                      var tooltipYtdContent = '<p class="bottom">For the year so far, your solar array has<br/>' + 
                          'generated <span class="orange">' + $filter('number')(curYtd) +
                          'kWh</span> saving <span class="orange">$' + 
                          $filter('number')(curYtdDollar) + '</span>';
                      if ((parseInt(prevYtd) !== 0) && (parseInt(curYtd) !== 0)){
                        ratioYtd = prevYtd / 100;
                        if (parseInt(curYtd) > parseInt(prevYtd)){
                          compareYtd = ((curYtd / ratioYtd) - 100).toFixed(0);
                        } else {
                          compareYtd = 100 - (curYtd / ratioYtd).toFixed(0);
                        }
                        tooltipYtdContent += ', which is <span class="orange">' + compareYtd + '% ' + 
                          compareLabelYtd + '</span> than the '+ $filter('number')(prevYtd) + 
                          'kWh generated for the same timeframe last year.</p>';
                      } else {
                        tooltipYtdContent += '';
                      }
                      if ((prevKWH !== 0) && (curKWH !== 0)){
                        ratio = prevKWH / 100;
                        if (parseInt(curKWH) > parseInt(prevKWH)) {
                          compareKWH = ((curKWH / ratio) - 100).toFixed(0);
                        } else if (curKWH < prevKWH) {
                          compareKWH = 100 - (curKWH / ratio).toFixed(0);
                        }
                        tooltipContents += '<p>Your solar array generated <span class="orange">' + 
                          $filter('number')(curKWH) + 'kWh</span> <br/>in ' + 
                          categories[pointX] + ' ' + curYear + 
                          ' which is <span class="orange">' + compareKWH +
                          '% ' + compareLabel + '</span> than the ' + $filter('number')(prevKWH) +
                          'kWh generated in the same month the previous year.</p>' + tooltipYtdContent;
                      } else {
                        tooltipContents += '<p>Your solar array generated <span class="orange">' + 
                          $filter('number')(curKWH) + 'kWh</span> <br/>in ' + 
                          categories[pointX] + ' ' + curYear + tooltipYtdContent;
                      }

                      return '<div class="yield-tooltip">' + tooltipContents + '</div>';
                    }
                  }
                },
                xAxis: {
                  categories: data.message.category,
                  lineColor: 'transparent'
                },
                yAxis: [{
                  opposite: true,
                  labels: {
                    formatter: function() {
                      return $filter('number')(this.value);
                    }
                  },
                  plotLines: [{
                    value: 0,
                    width: 1,
                    color: '#cccccc'
                  }],
                  title: {
                    align: 'low',
                    offset: 16,
                    text: 'kWh',
                    rotation: 0,
                    y: 20
                  }
                }/*,{
                  gridLineWidth: 0,
                  opposite: true,
                  labels: {
                    formatter: function() {
                      return $filter('number')(this.value);
                    },
                    style: {
                      color: '#6b9e67'
                    }
                  },
                  title: {
                    align: 'low',
                    offset: 16,
                    text: 'kWh',
                    rotation: 0,
                    style: {
                      color: '#6b9e67'
                    },
                    y: 20
                  }
                }*/],
                title: {
                  text: ''
                },
                size: {
                  height: 136
                },
                series: newSeries,
                loading: false,
                credits: {
                  enabled: false
                }
              };
            }, 10);
          };

          scope.drawGraph();
          scope.init();

          SourceSelectionEventService.listen(function (event, selectedSources) {
            scope.socketRequest.data.selectedFacilities = selectedSources.facilities;
            scope.socketRequest.data.selectedScopes = selectedSources.scopes;

            scope.isDataLoaded = false;
            //SocketIO.emit(scope.socketRequest.request, scope.socketRequest.data);
          });
        }
      };
  }]);

angular.module('bl.analyze.solar.surface')
  .controller('elementActualPredictedController', [ 
    '$scope', '$attrs', '$timeout', '$filter', 'SocketIO', 'SourceSelectionEventService',
    function($scope, $attrs, $timeout, $filter, SocketIO, SourceSelectionEventService) {

      var currentDay = moment();
      var currentYear = currentDay.year();
      var xAxisDateFormat = {
        'month': 'MMMM DD YYYY',
        'year': 'MMMM YYYY',
        'total': 'MMMM YYYY'
      };
      var chartColors = ['#ff6d2d', '#d5d9da'];
      var tooltips = {};
      var tooltipInfo = {
        actual: {
          date: '',
          energy: '',
          cloudy: '',
          sunny: ''
        },
        predicted: {
          date: '',
          energy: '',
          cloudy: '',
          sunny: ''
        }
      };

      $scope.isDataLoaded = false;
      $scope.currentDimension = 'month';

      $scope.$watch('currentDimension', function (newVal, oldVal) {
        if (newVal !== oldVal) {
          $scope.changeDimension(newVal);
        }
      });
        
      function getPredictedDate(actualDate) {
        if ($scope.currentDimension === 'month') {
          return moment(actualDate, 'DD MMM').subtract(1, 'months').format('DD MMM');
        } else {
          return moment(actualDate + ' ' + currentYear, 'MMM DD YYYY').subtract(1, 'years').format('MMM YY');
        }
      }
      
      function getPercentData(isCloudy, tooltipData) {
        var result;
        if (!tooltipData) {
          result = '-';
        } else if (!isNaN(tooltipData.cloudydays) && !isNaN(tooltipData.sunnydays)) {
          if ($scope.currentDimension === 'month') {
            if (isCloudy) {
              result = tooltipData.cloudydays ? 'Yes' : 'No';
            } else {
              result = tooltipData.sunnydays ? 'Yes' : 'No';
            }
          } else {
            if (tooltipData.cloudydays + tooltipData.sunnydays !== 0) {
              if (isCloudy) {
                result = tooltipData.cloudydays + ' (' +
                Math.round( tooltipData.cloudydays * 100 /
                (tooltipData.cloudydays + tooltipData.sunnydays )) + '%)';
              } else {
                result = tooltipData.sunnydays + ' (' +
                (100 -Math.round( tooltipData.cloudydays * 100 /
                (tooltipData.cloudydays + tooltipData.sunnydays ))) + '%)';
              }
            } else {
              result = '-';
            }
          }
        } else {
          result = '-';
        }
        return result;
      }
      
      function tooltipFormatter() {
        //var cursorClass = 'arrow-left';
        
        var hoverDateString, hoverDate = null;
        //var ySeries = chart.chart.yAxis[0].series;
        var pointX = this.point ? this.point.x : this.points[0].point.x;

        tooltipInfo.actual.date = '-';
        tooltipInfo.actual.energy = '-';
        tooltipInfo.actual.cloudy = '-';
        tooltipInfo.actual.sunny = '-';
        tooltipInfo.predicted.date = '-';
        tooltipInfo.predicted.energy = '-';
        tooltipInfo.predicted.cloudy = '-';
        tooltipInfo.predicted.sunny = '-';
        /*
        for(var i = 0; i < 2 && i < this.points.length; i++) {
          if ( this.points[i].series.name === 'Actual Energy') {
            hoverDateString = this.points[0].key + ' ' + currentYear;
            hoverDate = moment(hoverDateString, xAxisDateFormat[$scope.currentDimension]);
            if (moment(hoverDate).valueOf() <= moment(currentDay).valueOf()) {
              hoverDateString = this.points[0].key;
              tooltipInfo.actual.date = hoverDateString;
              tooltipInfo.actual.energy = $filter('number')(this.points[i].y.toFixed(2)) + ' Kw';
              tooltipInfo.actual.cloudy = getPercentData(true, tooltips[hoverDateString]);
              tooltipInfo.actual.sunny = getPercentData(false, tooltips[hoverDateString]);
              tooltipInfo.predicted.date = getPredictedDate(hoverDateString);
            }
          } else {
            hoverDateString = this.points[i].key;
            tooltipInfo.actual.date = this.points[i].key;
            tooltipInfo.predicted.date = getPredictedDate(hoverDateString);
            tooltipInfo.predicted.energy = $filter('number')(this.points[i].y.toFixed(2)) + ' Kw';
            tooltipInfo.predicted.cloudy = getPercentData(true, tooltips[tooltipInfo.predicted.date]);
            tooltipInfo.predicted.sunny = getPercentData(false, tooltips[tooltipInfo.predicted.date]);
          }
        }
        */
        var actualEnergy = $scope.chartData.actualEnergy.data;
        var predictedEnergy = $scope.chartData.predictedEnergy.data;

        hoverDateString = this.x + ' ' + currentYear;
        hoverDate = moment(hoverDateString, xAxisDateFormat[$scope.currentDimension]);
        if (moment(hoverDate).valueOf() <= moment(currentDay).valueOf()) {
          hoverDateString = this.x;
          tooltipInfo.actual.date = hoverDateString;
          tooltipInfo.actual.energy = $filter('number')(actualEnergy[pointX].toFixed(2)) + ' kWh';
          tooltipInfo.actual.cloudy = getPercentData(true, tooltips[hoverDateString]);
          tooltipInfo.actual.sunny = getPercentData(false, tooltips[hoverDateString]);
          tooltipInfo.predicted.date = getPredictedDate(hoverDateString);
        }
        hoverDateString = this.x;
        tooltipInfo.actual.date = this.x;
        tooltipInfo.predicted.date = getPredictedDate(hoverDateString);
        tooltipInfo.predicted.energy = $filter('number')(predictedEnergy[pointX].toFixed(2)) + ' kWh';
        tooltipInfo.predicted.cloudy = getPercentData(true, tooltips[tooltipInfo.predicted.date]);
        tooltipInfo.predicted.sunny = getPercentData(false, tooltips[tooltipInfo.predicted.date]);
        
        return '<div class="blue-box">'
          + '<h5 class="title">Cloudy vs Sunny Days</h5>'
          + '<div class="row">'
          + '  <div class="col-xs-6">'
          + '    <span>' + tooltipInfo.actual.date + '</span>'
          + '  </div>'
          + '  <div class="col-xs-6">'
          + '    <span>' + tooltipInfo.predicted.date + '</span>'
          + '  </div>'
          + '</div>'
          + '<div class="row">'
          + '  <div class="col-xs-6">'
          + '    <span class="orange">Actual: ' + tooltipInfo.actual.energy + '</span>'
          + '  </div>'
          + '  <div class="col-xs-6">'
          + '    <span class="light-gray">Predicted: ' + tooltipInfo.predicted.energy + '</span>'
          + '  </div>'
          + '</div>'
          + '<div class="row">'
          + '  <div class="col-xs-6">'
          + '    <span class="orange">Cloudy Days: ' + tooltipInfo.actual.cloudy + '</span>'
          + '  </div>'
          + '  <div class="col-xs-6">'
          + '    <span class="light-gray">Cloudy Days: ' + tooltipInfo.predicted.cloudy + '</span>'
          + '  </div>'
          + '</div>'
          + '<div class="row">'
          + '  <div class="col-xs-6">'
          + '    <span class="orange">Sunny Days: ' + tooltipInfo.actual.sunny + '</span>'
          + '  </div>'
          + '  <div class="col-xs-6">'
          + '    <span class="light-gray">Sunny Days: ' + tooltipInfo.predicted.sunny + '</span>'
          + '  </div>'
          + '</div></div>';
          
          //+ '<div class="' + cursorClass + '"></div>';
      }

      $scope.socketRequest = {
        request: 'assurf:inputactualpredictedenergy',
        data: {
          'dateRange': 'month',
          'selectedFacilities': [],
          'selectedScopes':[]
        }
      };

      SocketIO.watch('assurf:actualpredictedenergy', function(data) {
        $scope.drawChart(data);
      });

      SourceSelectionEventService.listen(function (event, selectedSources) {
        //$scope.socketRequest.data.selectedFacilities = selectedSources.facilities;
        //$scope.socketRequest.data.selectedScopes = selectedSources.scopes;

        $scope.isDataLoaded = false;
        //SocketIO.emit($scope.socketRequest.request, $scope.socketRequest.data);
      });

      $scope.drawChart = function (data) {

        var chartConfigOptions = {
          chart: {
            type: 'column',
            events: {
              drilldown: function() {
                //return scope.detailElement();
              },
              click: function() {
                //return scope.detailElement();
              },
              load: function() {
                $scope.isDataLoaded = true;
              },
              redraw: function() {
                $scope.isDataLoaded = true;
              }
            }
          },
          tooltip: {
            // shared: true,
            useHTML: true,
            borderColor: null,
            borderWidth: 0,
            borderRadius: 3,
            shadow: false,
            spacing: [0,0,0,0],
            backgroundColor: 'rgba(35, 43, 57, 0.9)',
            style: {
              padding: '20px',
              whiteSpace: 'normal'
            },
            shared: true,
            formatter: tooltipFormatter
          },
          legend: { enabled: false },
          credits: { enabled: false },
          colors: chartColors,
          exporting: {enabled: false}
        };

        var actualEnergy = { 'color': '#ff6d2d' };
        var predictedEnergy = { 'color': '#d5d9da' };
        var newSeries = [], i;

        for(i=0; i<data.series.length; i++) {
          if(data.series[i].name === 'Actual Energy') {
            angular.extend(actualEnergy, data.series[i]);
          }
          else if(data.series[i].name === 'Predicted Energy') {
            angular.extend(predictedEnergy, data.series[i]);
          }
        }

        $scope.chartData = {
          actualEnergy: actualEnergy,
          predictedEnergy: predictedEnergy
        };

        newSeries.push(actualEnergy);
        newSeries.push(predictedEnergy);

        $timeout(function() {
          $scope.columnChartConfig = {
            options: chartConfigOptions,
            title: {
              text: ''
            },
            xAxis: {
              categories: data.categories,
              labels: {
                style: {
                  fontSize: '10px'
                }
              }
            },
            yAxis: [{
              title: {
                text: ''
              },
              opposite: true,
              labels: {
                formatter: function(){
                  return $filter('number')(this.value) + 'kWh';
                }
              },
              plotLines: [{
                value: 0,
                width: 1,
                color: '#808080'
              }]
            }],
            series: newSeries,
            loading: false,
            size: {
              height: 167
            }
          };

          tooltips = data.tooltips || {};
          if (data.categories && data.categories.length > 2) {
            if (moment(data.categories[1], '').diff(moment(data.categories[0], ''), 'days') === 1) {
              $scope.currentDimension = 'month';
            } else {
              if ($scope.currentDimension === 'month' ) {
                $scope.currentDimension = 'year';
              }
            }
          }
          
        }, 10);
      };
      
      $scope.changeDimension = function (dimension) {
        if (dimension) {
          $scope.currentDimension = dimension;
        }
        $scope.getChartData();
      };

      $scope.getChartData = function () {
        $scope.socketRequest.data.dateRange = $scope.currentDimension;
        SocketIO.emit($scope.socketRequest.request, $scope.socketRequest.data);

        $scope.isDataLoaded = false;
      };

      //$scope.getChartData();
    }
  ])
  .directive('actualPredictedEnergy', ['$compile',
    function ($compile) {
      return {
        restrict: 'E',
        scope: false,
        transclude: true,
        templateUrl: 'app/elements/actual-predicted-energy/template.html',
        controller: 'elementActualPredictedController',
        link: function (scope, element, attrs, controller) {
        }
      };
    }]);
'use strict';

angular.module('bl.analyze.solar.surface')
  .service('weatherService', ['$q', 'SocketIO',
    function($q, SocketIO) {

      var today, history, forecast;

      function getTodayWeather(rawWeather) {
        today = {
          temperature: {
            now: Math.round(rawWeather.current.temperature),
            min: Math.round(rawWeather.forecast[0].temperatureMin),
            max: Math.round(rawWeather.forecast[0].temperatureMax)
          },
          cityName: rawWeather.current.city,
          air: {
            humidity: rawWeather.current.humidity,
            pressure: rawWeather.current.pressure,
            windSpeed: rawWeather.current.windSpeed
          },
          sunTime: {
            sunset: rawWeather.current.sunsetTime,
            sunrise: rawWeather.current.sunriseTime
          },
          weatherIcon: 'icon-weather-' + rawWeather.current.icon,
          summary: rawWeather.current.summary,
          lastReportedTime: rawWeather.current.time
        };
        return today;
      }

      function getForeWeather(rawWeather) {
        var limitCounts = 5;
        forecast = rawWeather.forecast.slice(0, limitCounts).map(function (forecast) {
          return {
            date: forecast.time,
            temperature: {
              min: Math.round(forecast.temperatureMin),
              max: Math.round(forecast.temperatureMax)
            }
          };
        });
        return forecast;
      }

      function getHistoricalWeather(rawWeather) {
        var limitCounts = 5;
        history = rawWeather.history.reverse().slice(0, limitCounts).map(function (history) {
          return {
            date: history.time,
            temperature: {
              min: Math.round(history.temperatureMin),
              max: Math.round(history.temperatureMax)
            }
          };
        });

        return history;
      }

      this.watchWeather = function (callback) {
        SocketIO.watch('assurf:weather', function(weather) {
          console.log('assurf:weather response:', weather);

          callback({
            todayWeather: getTodayWeather(weather),
            foreWeather: getForeWeather(weather),
            historicalWeather: getHistoricalWeather(weather)
          });
        });
      };

    }
  ]);
'use strict';

angular.module('bl.analyze.solar.surface')
    .service('userService', ['$http', '$q',
        function($http, $q) {
            this.getUserInfo = function (userID) {
                return $http.get('/v0/userinfo/' + userID);
            };
            this.updateUserInfo = function (userID, userInfo) {
                return $http.post('/v0/userinfo/' + userID, userInfo);
            };
            this.dummyGetUserInfo = function (userID) {
                return {
                    _id: 'userid',
                    permission: 'BP',
                    name: 'Kornel D',
                    phone: '1-800-275-5537',
                    email: 'kornel.dembek@brightergy.com'
                };
            };
            this.dummyUpdateUserInfo = function (userID, userInfo) {
                return {
                    then: function (callback) {
                        callback({success: true});
                    }
                };
            };
        }
    ]);
angular.module('bl.analyze.solar.surface')

.service('SourceSelectionEventService',
  ['$rootScope', 'SocketIO',
  function($rootScope, SocketIO) {
    this.broadcast = function(selectedFacilities, selectedScopes, selectedNodes) {

      SocketIO.emit('assurf:selectedsources', {
        'selectedFacilities': selectedFacilities,
        'selectedScopes': selectedScopes,
        'selectedNodes': selectedNodes
      });

      $rootScope.$broadcast('source-selection-change', {
        facilities: selectedFacilities,
        scopes: selectedScopes,
        nodes: selectedNodes
      });
    };
    this.listen = function(callback) {
      $rootScope.$on('source-selection-change',callback);
    };
  }]);
'use strict';

angular.module('bl.analyze.solar.surface')
  .service('solarTagService', ['$q', '$window', '$sce', '$filter', 'SocketIO', 'moment',
    function($q, $window, $sce, $filter, SocketIO, moment) {

      var facilityList, lastReportedDateTime = 0;

      function nodeInit(node, scope) {
        node.percent = '0' || node.percent;
        node.lastReportedValue = '0' || node.lastReportedValue;
        node.currentValue = '0' || node.currentValue;
        node.displayName = node.displayName || node.id;
        node.selected = scope.selected ? true : false;
        return node;
      }

      function scopeInit(scope, facility) {
        scope.percent = '0' || scope.percent;
        scope.lastReportedValue = '0' || scope.lastReportedValue;
        scope.currentValue = '0' || scope.currentValue;
        scope.selected = facility.selected ? true : false;
        scope.nodes = scope.nodes.map(function (node) {
          return nodeInit(node, scope);
        });
        scope.displayName = scope.displayName || scope.name;
        if (scope.selected) {
          scope.color = randomColor({luminosity: 'dark'});
        }
        return scope;
      }

      function facilityInit(facility) {

        facility.name = facility.displayName || facility.name;
        facility.percent = '0' || facility.percent;
        facility.lastReportedValue = '0' || facility.lastReportedValue;
        facility.currentValue = '0' || facility.currentValue;
        facility.displayName = facility.displayName || facility.name;
        facility.scopes = facility.scopes.map(function (scope) {
          return scopeInit(scope, facility);
        });
        if (facility.selected) {
          facility.color = randomColor({luminosity: 'dark'});
        }
        return facility;
      }

      function facilityUpdate(facility, updatedRawFacility) {

        angular.extend(facility, {
          firstReportedTime: moment.utc(updatedRawFacility.firstReportedTime).valueOf() / 1000,
          firstReportedValue: updatedRawFacility.firstReportedValue.toFixed(1),
          lastReportedTime: moment.utc(updatedRawFacility.lastReportedTime).valueOf() / 1000,
          lastReportedValue: updatedRawFacility.lastReportedValue.toFixed(1),
          currentValue: updatedRawFacility.currentValue.toFixed(1),
          maxValue: updatedRawFacility.maxValue.toFixed(1),
          minValue: updatedRawFacility.minValue.toFixed(1),
          percent: Math.ceil(updatedRawFacility.percent),
          totalEnergyGenerated: Math.ceil(updatedRawFacility.totalEnergyGenerated),
          trend: updatedRawFacility.trend
        });

        if (facility.trend === 'up') {
          facility.trendText = $sce.trustAsHtml('&#8593;');  // 8593 -> up arrow
        } else if (facility.trend === 'down') {
          facility.trendText = $sce.trustAsHtml('&#8595;');  // 8595 -> down arrow
        } else {
          facility.trendText = '';  // 8595 -> down arrow
        }

        if (lastReportedDateTime < facility.lastReportedTime) {
          lastReportedDateTime = facility.lastReportedTime;
        }

        if (facility.selected && !facility.color) {
          facility.color = randomColor({luminosity: 'dark'});
        }

        angular.forEach(facility.scopes, function (scope) {
          var updatedRawScope = updatedRawFacility.scopes[scope.name];
          if (!updatedRawScope) { return; }

          scopeUpdate(scope, updatedRawScope);
        });
        return facility;
      }

      function scopeUpdate(scope, updatedRawScope) {

        angular.extend(scope, {
          firstReportedTime: moment.utc(updatedRawScope.firstReportedTime).valueOf() / 1000,
          firstReportedValue: updatedRawScope.firstReportedValue.toFixed(1),
          lastReportedTime: moment.utc(updatedRawScope.lastReportedTime).valueOf() / 1000,
          lastReportedValue: updatedRawScope.lastReportedValue.toFixed(1),
          currentValue: updatedRawScope.currentValue.toFixed(1),
          maxValue: updatedRawScope.maxValue.toFixed(1),
          minValue: updatedRawScope.minValue.toFixed(1),
          percent: Math.ceil(updatedRawScope.percent),
          totalEnergyGenerated: Math.ceil(updatedRawScope.totalEnergyGenerated),
          trend: updatedRawScope.trend
        });

        if (scope.trend === 'up') {
          scope.trendText = $sce.trustAsHtml('&#8593;');  // 8593 -> up arrow
        } else if (scope.trend === 'down') {
          scope.trendText = $sce.trustAsHtml('&#8595;');  // 8595 -> down arrow
        } else {
          scope.trendText = '';  // 8595 -> down arrow
        }

        if (scope.selected && !scope.color) {
          scope.color = randomColor({luminosity: 'dark'});
        }

        return scope;
      }

      function adjustFaciiltyPercent (facilities) {
        var lastFacilityHasPercent;
        var totalPercent = 0;
        angular.forEach(facilities, function (facility) {
          if (!facility.selected) {
            facility.percent = 0;
          }
          totalPercent += facility.percent;
          if (facility.percent > 0) {
            lastFacilityHasPercent = facility;
          }
        });
        if (lastFacilityHasPercent) {
          lastFacilityHasPercent.percent = 100 - (totalPercent - lastFacilityHasPercent.percent);
        }
      }

      this.getAll = function () {
        facilityList = $window.renderSolarTags;
        facilityList = $filter('orderBy')(facilityList.facilities.map(facilityInit), 'selected', true);
        return $q.when(facilityList);
      };

      this.watchAllSolarTags = function (callback) {
        SocketIO.watch('assurf:sources', function(sources) {
          console.log('assurf:sources response:', sources);
          facilityList.map(function (facility) {
            var updatedRawFacility = sources[facility.name];
            if (!updatedRawFacility) { return facility; }
            return facilityUpdate(facility, updatedRawFacility);
          });

          adjustFaciiltyPercent(facilityList);
          callback(facilityList);
        });
      };

      this.getSourceDetail = function (sourceName) {
        var sourceDetail;
        var keepGoing = true;

        angular.forEach(facilityList, function (facility) {
          if(keepGoing === true) {
            if(facility.name === sourceName) {
              if(typeof facility['displayName'] !== 'undefined') {
                sourceDetail = facility;
              }
              keepGoing = false;
            } else {
              if(facility.scopes.length > 0) {
                angular.forEach(facility.scopes, function (scope) {
                  if(keepGoing === true) {
                    if(scope.name === sourceName) {
                      if(typeof scope['displayName'] !== 'undefined') {
                        sourceDetail = scope;
                      }
                      keepGoing = false;
                    }
                  }
                });
              }
            }
          }
        });

        return sourceDetail;
      };

      this.getLastReportedDateTime = function () {
        return lastReportedDateTime;
      };
    }
  ]);
'use strict';
angular.module('bl.analyze.solar.surface')

.factory('SocketIO', ['$rootScope', '$q', 'socketFactory', 'wsEntryPoint', 'wsConfig', 'firstLoadEventList',
    'mainStageResponseList',
  function ($rootScope, $q, socketFactory, wsEntryPoint, wsConfig, firstLoadEventList, mainStageResponseList) {
    var myIoSocket, mySocket, mySocketId;
    var initialLoadEvent = angular.copy(firstLoadEventList);
    var defer = $q.defer();
    var watchCallbacks = {};

    var mainStageResponseListForChecking = [];

    var broadCastArg = { showLoading: false };

    for (var i = 0; i < mainStageResponseList.length; i ++) {
      mainStageResponseListForChecking[mainStageResponseList[i]] = 0;
    }

    wsEntryPoint = wsEntryPoint || 'http://localhost:3000';  // it should be loaded from jade

    myIoSocket = io.connect(wsEntryPoint, wsConfig);
    mySocket = socketFactory({
      ioSocket: myIoSocket
    });

    function sendRequest(eventName, data, socketId) {
      var requestData = angular.extend(data, {
        'socketId': socketId
      });
      mySocket.emit(eventName, requestData);
    }

    function decompressResponse(response) {
      if (response instanceof ArrayBuffer) {
        var binData = new Uint8Array(response),
            plain = pako.ungzip(binData, {to: 'string'});
        return angular.fromJson(plain);
      } else {
        return response;
      }
    }

    function countInitialLoadEvent(eventName) {
      if (!initialLoadEvent.length) {
        return ;
      }
      if (initialLoadEvent.indexOf(eventName) > -1) {
        initialLoadEvent.splice(initialLoadEvent.indexOf(eventName), 1);
        $rootScope.initialDataLoadedPercent =
          Math.ceil((firstLoadEventList.length - initialLoadEvent.length + 1) /
                    (firstLoadEventList.length + 1) * 100);
        console.log('Percentage goes here:', $rootScope.initialDataLoadedPercent);
      }
    }

    function resetMainStageResponseListArray($rootScope, eventName, broadCastArg) {
      if (eventName === 'assurf:selectedsources') {
        //$('.wrapper-sources').find('.loading-animation').css('display', 'block');
        broadCastArg.showLoading = true;
        $rootScope.$broadcast('SHOW_SOURCE_LOADING', broadCastArg);
        for (var i = 0; i < mainStageResponseList.length; i++) {
          mainStageResponseListForChecking[mainStageResponseList[i]] = 0;
        }
      }
    }

    function checkLoadedMainStageResponseList() {
      for (var i = 0; i < mainStageResponseList.length; i++) {
        if (mainStageResponseListForChecking[mainStageResponseList[i]] === 0) {
          return false;
        }
      }
      return true;
    }

    function processLoadingImageByResponse($rootScope, eventName, broadCastArg) {
      if (mainStageResponseList.indexOf(eventName) > -1) {
        mainStageResponseListForChecking[eventName] = 1;

        if (checkLoadedMainStageResponseList() === true) {
          //$('.wrapper-sources').find('.loading-animation').css('display', 'none');
          broadCastArg.showLoading = false;
          $rootScope.$broadcast('SHOW_SOURCE_LOADING', broadCastArg);
        }
      }
    }

    // Get Socket ID;
    mySocket.on('connected', function (data) {
      data = decompressResponse(data);

      if (data.socketId) {
        mySocketId = data.socketId;
        console.log('SocketIO get socketId:', mySocketId);
        defer.resolve(mySocketId);
      } else {
        console.log('Socket Channel[%s] Error: %s', 'connected', data.message);
      }
    });

    return {
      _mySocket: mySocket,
      _getSocketId: function () {
        return mySocketId;
      },
      emit: function (eventName, data) {
        // Check if we have socketId;
        if (mySocketId) {
          console.log('Socket Request on [%s] channel:',eventName, data);
          resetMainStageResponseListArray($rootScope, eventName, broadCastArg);
          sendRequest(eventName, data, mySocketId);
        } else {
          defer.promise.then(function (socketId) {
            sendRequest(eventName, data, socketId);
          });
        }
      },
      watch: function (eventName, callback) {
        if (!watchCallbacks[eventName]) {
          watchCallbacks[eventName] = [];
        }
        watchCallbacks[eventName].push(callback);

        mySocket.on(eventName, function (data) {
          data = decompressResponse(data);
          console.log('Socket Response on [%s] channel:',eventName, data);

          processLoadingImageByResponse($rootScope, eventName, broadCastArg);

          if (!data.success){
            console.log('Socket Channel[%s] Error: %s', eventName, data.message);
            return;
          }
          $rootScope.$apply(function () {
            countInitialLoadEvent(eventName);
            angular.forEach(watchCallbacks[eventName], function (callback) {
              callback.call(mySocket, data.message);
            });
          });
        });
      },
      unwatch: function (eventName, callback) {
        if (typeof callback === 'function') {
          var cbIndex = watchCallbacks[eventName].indexOf(callback);
          if (cbIndex > 0) {
            watchCallbacks[eventName].splice(cbIndex, 1);
          }
        } else {
          mySocket.removeAllListeners(eventName);
        }
      },
      removeAllListeners: function () {
        mySocket.removeAllListeners();
      }
    };
  }
]);
'use strict';

angular.module('bl.analyze.solar.surface')
  .service('savingService', ['$filter', 'SocketIO', 'moment', 'solarTagService',
    function ($filter, SocketIO, moment, solarTagService) {
    var lastSaving, lastSavingTable;

    function getKPIfromSaving (raw) {
      var totalProductionBySources = [];
      Object.keys(raw.totalProductionBySources).map(function (sourceName) {
        var sourceDetail = solarTagService.getSourceDetail(sourceName);
        totalProductionBySources.push({
          name: sourceName,
          displayName: sourceDetail ? sourceDetail.displayName : sourceName,
          kwh: raw.totalProductionBySources[sourceName]
        });
      });

      return {
        totalSavingPerDateRange: Math.ceil(raw.totalSavingPerDateRange),
        totalSavings: $filter('number')(raw.totalSavings, 2),
        totalProductionBySources: totalProductionBySources,
        totalProduction: raw.totalProduction
      };
    }

    function getSavingTable(rawTable) {
      var serverResponseDateFormat = 'MMMM DD, YYYY'; //March 10, 2015
      return rawTable.table.map(function (row) {
        return {
          'date': moment.utc(row.date, serverResponseDateFormat).valueOf() / 1000,
          'percent': Math.round(row.percent),
          'sources': row.sources
        };
      });
    }

    this.watch = function (callback) {
      SocketIO.watch('assurf:savings', function (savings) {
        lastSaving = {
          areaChart: savings.areaChart,
          comboChart: savings.comboChart,
          kpi: getKPIfromSaving(savings)
        };
        callback(lastSaving);
      });
      return this;
    };

    this.emit = function (dateRange) {
      var requestData = {
        'dateRange': dateRange || 'month'
      };
      SocketIO.emit('assurf:getsavings', requestData);
    };

    this.watchTable = function (callback) {
      SocketIO.watch('assurf:table', function (table) {
        lastSavingTable = getSavingTable(table);
        callback(lastSavingTable);
      });
      return this;
    };
  }]);
'use strict';

angular.module('bl.analyze.solar.surface')
  .service('powerService', ['$q', 'SocketIO', 'moment', 'solarTagService',
    function($q, SocketIO, moment, solarTagService) {
      var lastRTPInfo, lastCurrentPowerInfo;

      function getKPIFromRTP(rawRTP) {
        var productionBySources = [];

        angular.forEach(rawRTP.totalProductionBySources, function (kwObj, sourceName) {
          productionBySources.push({
            'name': sourceName,
            'kw': parseFloat(kwObj.value).toFixed(1),
            'trend': kwObj.trend
          });
        });

        return {
          'totalPowerGeneration': parseFloat(rawRTP.totalGeneration.value).toFixed(1),
          'totalPowerGenerationTrend': rawRTP.totalGeneration.trend,
          'generationBySources': productionBySources
        };
      }

      function getPrimaryFromRTP(rawRTP) {
        var xaxis,
            datapoints,
            serverResponseDateFormat = 'h:mma, MMMM DD, YYYY'; //3:23pm, March 10, 2015

        // Convert date string to timestamp in User timezone;
        xaxis = rawRTP.mainChart.categories.map(function (originalDate) {
          return moment.utc(originalDate, serverResponseDateFormat).valueOf() / 1000;
        });

        // Insert the serie color from source detail
        datapoints = rawRTP.mainChart.series.map(function (serie) {
          var sourceDetail = solarTagService.getSourceDetail(serie.name);
          if (sourceDetail) {
            serie.name = sourceDetail.displayName;
            serie.color = sourceDetail.color;
          } else if (serie.name === 'Total Generation') {
            // $brand-primary color;
            serie.color = '#e16030';
          } else {
            serie.color = randomColor({luminosity: 'dark'});
          }
          return serie;
        });

        return {
          'xAxis': xaxis,
          'datapoints': datapoints
        };
      }

      this.watchRTPower = function (callback) {

        SocketIO.watch('assurf:realtimepower', function (data) {
          lastRTPInfo = {
            'lastUpdatedTime': solarTagService.getLastReportedDateTime()
                               ? solarTagService.getLastReportedDateTime()
                               : moment().unix(),
            'kpiData': getKPIFromRTP(data),
            'primary': getPrimaryFromRTP(data)
          };

          callback(lastRTPInfo);
        });

        return this;
      };

      this.watchCurrentPower = function (callback) {
        SocketIO.watch('assurf:power', function (data) {
          lastCurrentPowerInfo = {
            current: data.currentPower.toFixed(1),
            currentDayAvg: data.currentDayPower.toFixed(1),
            minAvg: data.minPower.toFixed(1),
            maxAvg: data.maxPower.toFixed(1)
          };

          lastCurrentPowerInfo.unit = lastCurrentPowerInfo.current >= 1000 ? 'MW' : 'kW';

          callback(lastCurrentPowerInfo);
        });
        return this;
      };

      this.emitRTPower = function (dateRange) {
        var data = {
          'dateRange': dateRange || 'month'
        };

        SocketIO.emit('assurf:getrealtimepower', data);
      };
    }
  ]);
'use strict';

angular.module('bl.analyze.solar.surface')
    .service('facilityDetailsService', ['$http', '$rootScope', 'SocketIO', '$modal', '$timeout', '$window', '$filter',
        function($http, $rootScope, SocketIO, $modal, $timeout, $window, $filter) {
            var service = this;
            var selectedFacilityId;
            var facilityPosition = '1,1'
              ;
            var facilityMapWidth = 1024;

            $rootScope.socketRequest = {request:{}, data:{socketId:null}};
            $rootScope.resizedChart = false;
            $rootScope.ppdLoaded = false;
            $rootScope.chartInstance = null;
            $rootScope.socketId = null;

            SocketIO.watch('assurf:sources', function(data) {
                
            });

            SocketIO.watch('assurf:facilitydrilldown', function(data) {
                $rootScope.chartDataEnergy = data['chart_data_energy'];
                $rootScope.chartDataPower = data['chart_data_power'];
                service.drawChart();
            });

            this.setDetailsValues = function(selectedFacility) {
                $rootScope.ppdLoaded = false;
                $rootScope.chartInstance = null;
                facilityPosition = selectedFacility.latitude + ',' + selectedFacility.longitude;
                $rootScope.facilityLocation = (selectedFacility.address) ? selectedFacility.address : 'Unknown';
                $rootScope.facilityPotentialPower = selectedFacility.potentialPower;
                var tmp = selectedFacility.totalEnergyGenerated;
                if(tmp) {
                    (selectedFacility.totalEnergyGenerated).toFixed(1);
                }

                $rootScope.totalFacilityEnergyGenerated = tmp;
                $rootScope.totalFacilityEnergyGeneratedTrend = selectedFacility.trend;

                tmp = selectedFacility.firstReportedTime;
                $rootScope.facilityCommissioning = $window.moment(tmp).format('MMMM, YYYY');
                selectedFacilityId = selectedFacility.id;
                $rootScope.socketRequest = {
                    request: 'assurf:inputfacilitydrilldown', 
                    data: {
                        'inspectedFacility': selectedFacilityId
                    }
                };    
                //$rootScope.socketRequest.data.socketId = $rootScope.socketId;
                SocketIO.emit($rootScope.socketRequest.request, $rootScope.socketRequest.data);
                service.drawFacilityMap();
            };

            this.drawFacilityMap = function() {
                var ppdmapHtml = '<img src="https://maps.googleapis.com/maps/api/staticmap?center=';
                ppdmapHtml += facilityPosition + '&markers=' + facilityPosition + '&zoom=14&size=';
                ppdmapHtml += facilityMapWidth + 'x410">';
                $('#ppdmap_container').html(ppdmapHtml);
            };

            this.drawChart = function() {
                var data = $rootScope.chartDataEnergy;
                var myTimeZoneOffset = (new Date()).getTimezoneOffset();
                if(data) {
                    if(data.length === 0) {
                        data = null;
                    }else {
                        $.each(data, function(idx, row) {
                            row.shift();
                        });
                    }
                }
                if(!$rootScope.chartInstance) {
                    $rootScope.chartInstance = $('#facilityDetailEnergyChart').highcharts('StockChart', {
                        credits: {
                            enabled: false
                        },
                        chart: {
                            zoomType: '',
                            style: {
                                fontFamily: 'HelveticaNeueW02-55Roma, Helvetica, Arial',
                                fontSize: '11px'
                            },
                            /* width: $('.powerplant-details').width()-30, */
                            events: {
                                redraw: function() {
                                    facilityMapWidth = $('.ppd-photo').width();
                                    service.drawFacilityMap();
                                    $rootScope.ppdLoaded = true;
                                },
                                load: function() {                                     
                                    facilityMapWidth = $('.ppd-photo').width();
                                    service.drawFacilityMap();
                                    $rootScope.ppdLoaded = true;
                                }
                            }
                        },
                        navigator : {
                            enabled : false
                        },
                        navigation : {
                            buttonOptions : {
                                enabled : false
                            }
                        },
                        scrollbar : {
                            enabled : false
                        },
                        rangeSelector : {
                            enabled : false
                        },
                        colors: ['#ff7a41'],
                        title : {
                            text : ''
                        },
                        xAxis: {
                            labels: {
                                formatter: function() {
                                    return moment.unix(this.value / 1000).format('MMM') + ' 15';
                                }
                            }
                        },
                        yAxis: [{
                            title: {
                                text: ''
                            },
                            labels: {
                                y: 4,
                                align: 'left',
                                formatter: function(){
                                    return this.value + ' kWh';
                                }
                            },
                            opposite: true,

                            min: 0,
                            plotLines: [{
                                value: 0,
                                width: 0,
                                color: '#808080'
                            }]
                        },  {
                            gridLineWidth: 0,
                            lineWidth: 0,
                            lineColor: '#cccccc',
                            title: {
                                text: '',
                            }
                        }],/*
                        tooltip: {
                            backgroundColor: 'rgba(35,43,57,0.9)',
                            borderWidth: 0,
                            shadow: false,
                            style: {
                                color: '#ffffff',
                                fontSize: '12px',
                                padding: '15px'
                            }
                        },*/
                        tooltip: {
                            useHTML: true,
                            borderColor: null,
                            borderWidth: 0,
                            borderRadius: 3,
                            shadow: false,
                            spacing: [0,0,0,0],
                            backgroundColor: 'rgba(35, 43, 57, 0.9)',
                            style: {
                              padding: '20px',
                              whiteSpace: 'normal'
                            },
                            formatter: function () {
                              var colors = ['orange', 'blue', 'green'];
                              var tootipContents = '<div class="blue-box">' + 
                                '<h5 class="title"><span>Energy</span>'+ 
                                moment.unix(this.x/1000).format('MMM, YYYY') +'</h5>' + 
                                '<div class="row">' + 
                                  '<div class="col-xs-6">' + 
                                    '<span>Final:</span>' + 
                                  '</div>' + 
                                  '<div class="col-xs-6 text-right">' + 
                                    '<span class="' + colors[0] + '">' + 
                                      $filter('number')(this.points[0].point.close, 2) + 'kWh</span>' + 
                                  '</div>' + 
                                '</div>' +
                                '<div class="row">' + 
                                  '<div class="col-xs-6">' + 
                                    '<span>Maximum:</span>' + 
                                  '</div>' + 
                                  '<div class="col-xs-6 text-right">' + 
                                    '<span class="' + colors[1] + '">' + 
                                      $filter('number')(this.points[0].point.high, 2) + 'kWh</span>' + 
                                  '</div>' + 
                                '</div>' +
                                '<div class="row">' + 
                                  '<div class="col-xs-6">' + 
                                    '<span>Minimum:</span>' + 
                                  '</div>' + 
                                  '<div class="col-xs-6 text-right">' + 
                                    '<span class="' + colors[2] + '">' + 
                                      $filter('number')(this.points[0].point.low, 2) + 'kWh</span>' + 
                                  '</div>' + 
                                '</div>' +
                                '<div class="row">' + 
                                  '<div class="col-xs-6">' + 
                                    '<span>Initial:</span>' + 
                                  '</div>' + 
                                  '<div class="col-xs-6 text-right">' + 
                                    '<span class="' + colors[0] + '">' + 
                                      $filter('number')(this.points[0].point.open, 2) + 'kWh</span>' + 
                                  '</div>' + 
                                '</div>' + 
                              '</div>';

                              return tootipContents;
                            }
                        },
                        series : [{
                            type : 'candlestick',
                            name : 'Energy',
                            color: 'rgba(255, 121, 64, 0.9)',
                            lineColor: 'rgba(254, 189, 159, 0.9)',
                            upColor: 'rgba(254, 189, 159, 0.9)',
                            states: {
                              hover: {
                                enabled : false
                              }
                            },
                            data : data,
                            dataGrouping : {
                                units : [
                                    [
                                        'week', // unit name
                                        [1] // allowed multiples
                                    ], [
                                        'month',
                                        [1, 2, 3, 4, 6]
                                    ]
                                ]
                            }
                        }]
                    });
                }else {
                    $rootScope.chartInstance.highcharts().series[0].update({
                        data: data
                    });
                }
                data = $rootScope.chartDataPower;
                
                if(data) {
                    var categoriesList = [];
                    for(var i=0; i<data.categories.length; i++){
                        var ts = $window.moment(data.categories[i]);
                        if(myTimeZoneOffset < 0 ) {
                            ts = ts.subtract(myTimeZoneOffset, 'minutes').format();
                        }
                        else {
                            ts = ts.add(myTimeZoneOffset, 'minutes').format();
                        }
                        categoriesList.push(ts);
                    }
                    
                    $rootScope.facilityDetailRealTimePowerChartConfig = {
                        options: {
                            credits: {
                                enabled: false
                            },
                            chart: {
                                type: 'areaspline',
                                height: 410,
                                spacing: [10, 0, 15, 0],
                                style: {
                                    width: '100%'
                                },
                                /*width: $('.powerplant-details').width(),*/
                                events: {
                                    redraw: function() {
                                        facilityMapWidth = $('.ppd-photo').width();
                                        service.drawFacilityMap();
                                        $rootScope.ppdLoaded = true;
                                    },
                                    load: function() {
                                        facilityMapWidth = $('.ppd-photo').width();
                                        service.drawFacilityMap();
                                        $rootScope.ppdLoaded = true; 
                                    }
                                }
                            },
                            tooltip: {
                                valueSuffix: 'kW',
                                backgroundColor: 'rgba(35,43,57,0.9)',
                                borderRadius: 3,
                                borderWidth: 0,
                                shadow: false,
                                useHTML: true,
                                lineWidth: 1,
                                formatter: function() {
                                    var yVal = (this.y).toFixed(2);
                                    var atGeneratedTime = $window.moment(this.x).format('MMM D');
                                    var tooltipTxt = '<div class="info"><div class="blue-box">';
                                        tooltipTxt += '<h4 class="text-orange">' + yVal + ' kWh</h4>';
                                        tooltipTxt += '<span>Power Generated on ' + atGeneratedTime + '</span>';
                                        tooltipTxt += '</div></div>';
                                    return tooltipTxt;
                                }
                            },
                            colors: ['#ff7a41']
                        },
                        exporting: {
                            enabled: false
                        },
                        title: {
                            text: '',
                            x: -20 //center
                        },
                        xAxis: {
                            lineColor: 'transparent',
                            categories: categoriesList,
                            labels: {
                                formatter: function() {
                                    return $window.moment(this.value).format('MMM D');
                                }
                            }
                        },
                        yAxis: {
                            min: 0,
                            title: {
                                text: ''
                            },
                            gridLineColor: '#cccccc',
                            plotLines: [{
                                value: 0,
                                width: 1,
                                color: '#808080'
                            }],
                            labels: {
                                enabled: false
                            }
                        },
                        series: [{
                            name: 'Real-Time Power',
                            data: data.series,
                            marker: {
                                enabled: false
                            },
                            states: {
                                hover: {
                                    lineWidth: 1,
                                    lineWidthPlus: 0
                                }
                            },                            
                            lineWidth: 1,
                            fillColor : {
                                linearGradient : {
                                    x1: 0,
                                    y1: 0,
                                    x2: 0,
                                    y2: 1
                                },
                                stops : [
                                    [0, $window.Highcharts.Color('#ff7a41').setOpacity(0.8).get('rgba')],
                                    [1, $window.Highcharts.Color('#ff7a41').setOpacity(0.1).get('rgba')]
                                ]
                            },
                            threshold: null
                        }],
                        loading: false
                    };
                }
                
                if($rootScope.resizedChart !== true) {
                    $timeout(function() {
                        $(window).trigger('resize');
                        $rootScope.resizedChart = true;
                    }, 10);
                }
            };

            this.changeYear = function(dimension) {
                $rootScope.ppdLoaded = false;
                $rootScope.currentppdDimension = dimension;
                $rootScope.socketRequest = {
                    request: 'assurf:inputfacilitydrilldown', 
                    data: {
                        'dateRange': dimension + '',
                        'inspectedFacility': selectedFacilityId
                    }
                };    
                //$rootScope.socketRequest.data.socketId = $rootScope.socketId;
                console.log($rootScope.socketRequest.data);
                SocketIO.emit($rootScope.socketRequest.request, $rootScope.socketRequest.data);
            };
        }
    ]);
'use strict';

angular.module('bl.analyze.solar.surface')
  .service('equivalenciesService', ['$filter', 'SocketIO',
    function($filter, SocketIO) {
      var lastEquiv, lastCarbon;

      this.watchEquivalencies = function (callback) {
        SocketIO.watch('assurf:equivalencies', function (equiv) {
          lastEquiv = {
            carsRemoved: equiv.passengerVehiclesPerYear,
            /*homePowered: equiv.homeElectricityUse,*/
            homePowered: equiv.homeEnergyUse,
            seedlingsGrown: equiv.numberOfTreeSeedlingsGrownFor10Years,
            refrigerators: equiv.refrigerators,
            mobilePhones: equiv.mobilePhones,
            batteries: equiv.aaBatteries,
            avoidedCarbon: equiv.avoidedCarbon,
            gallonsGas: equiv.gallonsOfGasoline,
            tankersGas: equiv.tankerTrucksFilledWithGasoline,
            railroadCarsCoal: equiv.railcarsOfCoalburned,
            barrelsOil: equiv.barrelsOfOilConsumed,
            propaneCylinders: equiv.propaneCylindersUsedForHomeBarbecues,
            powerPlants: equiv.coalFiredPowerPlantEmissionsForOneYear,
            kwh: $filter('number')(equiv.kwh, 0)
          };
          callback(lastEquiv);
        });
        return this;
      };

      this.emitEquivalencies = function (dateRange) {
        var data = {
          'dateRange': dateRange || 'month'
        };

        SocketIO.emit('assurf:getequivalencies', data);
      };

      this.watchCarbonAvoided = function (callback) {
        SocketIO.watch('assurf:carbonavoided', function (CA) {
          lastCarbon = {
            carbonAvoided: CA.carbonAvoided,
            carbonAvoidedTotal: CA.carbonAvoidedTotal
          };
          callback(lastCarbon);
        });
        return this;
      };

      this.emitCarbonAvoided = function (dateRange) {
        var data = {
          'dateRange': dateRange || 'month'
        };

        SocketIO.emit('assurf:getcarbonavoided', data);
      };
    }
  ]);
'use strict';

angular.module('bl.analyze.solar.surface')
  .service('energyService', ['$q', 'SocketIO', 'moment', 'solarTagService',
    function($q, SocketIO, moment, solarTagService) {
      var lastCurrentEnergy, lastTodayEnergyDrilldown, lastSunnyDayInfo, lastTEG;

      function getKPIFromTEDrilldown(rawData) {
        var energyBySources  = [];

        angular.forEach(rawData.totalProductionBySources, function (kwh, sourceName) {
          var sourceDetail = solarTagService.getSourceDetail(sourceName);
          energyBySources.push({
            'name': sourceDetail ? sourceDetail.displayName : sourceName,
            'kwh': kwh
          });
        });

        return {
          'totalEnergy': rawData.totalProduction,
          'energyBySources': energyBySources
        };
      }
      
      function getSerieFromTEDrilldown(data) {
        return data.categories.map(function (datetime, idx) {
          return [
            moment.utc(datetime).valueOf(),
            data.series[0].data[idx]
          ];
        });
      }

      this.watchCurrentEnergy = function (callback) {
        SocketIO.watch('assurf:energy', function (data) {
          lastCurrentEnergy = {
            today: Math.round(data.energyToday),
            utilitySavingToday: Math.round(data.utilitySavingToday),
            utilitySavingMonth: Math.round(data.utilitySavingMonth),
            minAvg: Math.round(data.minEnergy),
            maxAvg: Math.round(data.maxEnergy)
          };

          lastCurrentEnergy.unit = data.energyToday >= 1000 ? 'MWh' : 'kWh';

          callback(lastCurrentEnergy);
        });
        return this;
      };

      this.watchEnergyDrillDown = function (callback) {

        SocketIO.watch('assurf:energytodaykpidrilldown', function (data) {
          lastTodayEnergyDrilldown = {
            kpi: getKPIFromTEDrilldown(data),
            chart: {
              energy: {
                name: 'Energy Generated',
                data: getSerieFromTEDrilldown(data.energy)
              },
              power: {
                name: 'Current Power',
                data: getSerieFromTEDrilldown(data.power)
              }
            }
          };

          callback(lastTodayEnergyDrilldown);
        });
        return this;
      };

      this.getLastSunnyDayEnergy = function (callback) {
        SocketIO.watch('assurf:sunnyday', function (data) {
          var lastdata = data[0];
          if (lastdata) {
            lastSunnyDayInfo = {
              day: lastdata.day,
              energy: Math.round(lastdata.Energy)
            };
          } else {
            lastSunnyDayInfo = null;
          }
          callback(lastSunnyDayInfo);
        });

        return this;
      };

      this.watchTEG = function (callback) {
        SocketIO.watch('assurf:totalenergygeneration', function(data) {
          lastTEG = {
            value: data.totalEnergyGeneration,
            unit: 'kWh'
          };

          if (data.totalEnergyGeneration < 1000) {
            lastTEG.unit = 'kWh';
          } else if (data.totalEnergyGeneration >= 1000) {
            lastTEG.unit = 'MWh';
          } else if (data.totalEnergyGeneration >= 1000000) {
            lastTEG.unit = 'gWh';
          }

          callback(lastTEG);
        });
      };

      this.emitTEG = function (dateRange) {
        var data = {
          'dateRange': dateRange || 'month'
        };

        SocketIO.emit('assurf:gettotalenergygeneration', data);
      };
    }
  ]);
angular.module('bl.analyze.solar.surface')
.service('responseDecorator',
  function () {
    /*
    function isInt(n) {
      return n %% 1 === 0;
    }
    function isFloat(f) {
      return n === +f && n !== (f|0);
    }
    function decorateFloat(f) {
      Number((6.688689).toFixed(1));
    }
    */
  }
);
'use strict';

angular.module('bl.analyze.solar.surface')
  .directive('asTooltip', [function () {
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

          classes += ' drop-theme-arrows';

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
            target: element.context,
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

angular.module('bl.analyze.solar.surface')
  .directive('asToggleCollapse', function () {
    /*function setDrillDownModalPosition (expanded) {
      var leftMargin = expanded ? 500 : 60;
      $('.modal.drilldown.in').css({left: leftMargin + 'px'});
    }
*/
    return {
      restrict: 'A',
      link: function (scope, element, attrs) {
        if (!attrs.asToggleCollapse) {
          return false;
        }

        $(element).click(function () {
          $(attrs.asToggleCollapse).toggleClass('collapsed');

          $('.drilldown.modal').toggleClass('opened-sp');
          $('.drilldown.modal .ng-scope').toggleClass('opened-sp');

          $('body').toggleClass('collapsed');

          $(window).trigger('resize');

          //setDrillDownModalPosition(!$('body').hasClass('collapsed'));
        });

        $(document).ready(function () {

        });
      }
    };
  });
'use strict';

angular.module('bl.analyze.solar.surface')
  .directive('asSpSearchBox', function () {
    return {
      restrict: 'E',
      require: '^ngModel',
      scope: {
        ngModel: '='
      },
      template: ['<div class="sp-search" role="search"><form class="sp-search-form" action="">',
                '<div class="sp-search-input-wrapper"><input id="sp-search-input" class="sp-search-input"',
                'type="text", placeholder="Search Sources...", autocomplete="off" ng-model="ngModel"/></div>',
                '<button type="submit" id="sp-search-submit" class="sp-source-submit">',
                '<i class="icon icon-search"></i></button></form></div>'].join(''),
      link: function (scope, element, attrs) {
        $(element).on('click', '#sp-search-submit', function (e) {
          var inputWrapper = $(element)
            .find('.sp-search-input-wrapper')
            .toggleClass('extend');
          if (inputWrapper.hasClass('extend')) {
            inputWrapper.find('input').focus();
          }
          e.preventDefault();
        });

        $(element).on('blur', 'input', function (e) {
          if ($(e.relatedTarget).hasClass('sp-source-submit')) {
            return ;
          }
          $(element)
            .find('.sp-search-input-wrapper').removeClass('extend');
        });
      }
    };
  });
'use strict';

angular.module('bl.analyze.solar.surface')
  .constant('mobileWidth', 767)
  .directive('asSpListScrollBar',
    ['$window', '$position', 'mobileWidth',
    function ($window, $position, mobileWidth) {
      var setCustomScrollBar = function (element, height) {
        $(element).mCustomScrollbar({
          axis: 'y',
          theme: 'light',
          setHeight: height
        });
      };

      var updateWhenBrowserResize = function (element) {
        $(window).resize(function () {
          var windowWidth = $(window).width();
          var newHeight;
          if (windowWidth <= mobileWidth) { // if size is mobile size
            newHeight = 400;
          } else {
            newHeight = getHeightOfViewport(element);
          }

          $(element).css({
            'height': newHeight + 'px'
          });
        });
      };

      // It should return the height of visible part of element.
      var getHeightOfViewport = function (element) {
        var totalHeight = $window.innerHeight;

        var elementOffset = /*$position.offset(element);*/$(element).position();
        return totalHeight - elementOffset.top; //;
      };

      var getHeightOfTable = function (element) {
        var totalHeight = $(window).height() + $(window).scrollTop();
        
        var elementOffsetTop = 500; // offset top of table
        return totalHeight - elementOffsetTop - 10;
      };

      return {
        restrict: 'A',
        link: function (scope, element, attrs) {
          var visibleHeight;
          if (attrs.scrollWrapperHeight) {
            visibleHeight = attrs.scrollWrapperHeight;
            setCustomScrollBar(element, visibleHeight);
          } else if (attrs.widgetTable === 'generation-per-month') {
            visibleHeight = getHeightOfTable(element);
            setCustomScrollBar(element, visibleHeight);
          } else {
            visibleHeight = getHeightOfViewport(element);
            setCustomScrollBar(element, visibleHeight);
            updateWhenBrowserResize(element);
          }
        }
      };
    }
  ]);
'use strict';

angular.module('bl.analyze.solar.surface')
  .directive('asNavDropdown', ['$compile', '$timeout', '$rootScope', '$http', '$window', 'wsEntryPoint',
    function($compile, $timeout, $rootScope, $http, $window, wsEntryPoint) {
        var $doc = $(document);
        var _autoCloseEventBinded = false;
        var popUpTmpl = [
          '<div class="popover nav-dropdown bottom"><div class="arrow"></div>',
          '<div class="popover-content"><ul class="clearfix">',
          '<li class="menu-item" data-item="user"><a><i class="icon icon-ui-user"></i>User</a></li>',
          '<li class="menu-item" data-item="account"><a><i class="icon icon-ui-account"></i>Account</a></li>',
          '<li class="menu-item" data-item="logout"><a><i class="icon icon-ui-logout"></i>Logout</a>',
          '</li></ul></div></div>'
        ].join('');

        //$templateCache.put('popup.html', popUpTmpl);

        return {
          restrict: 'AC',
          scope: {
              asNavDropdown: '=',
              userInfo: '='
          },
          link: function (scope, element, attr) {
            var $tooltip = $('<div class="blue-box"><p>' + scope.userInfo.fullname + 
                '</p><p class="bottom">Account: ' + scope.userInfo.accountname + '</p></div>');
            element.after($tooltip);

            var topTPos = element.outerHeight() + 10;
            var leftTPos = element.outerWidth() - 150;
            $tooltip.css({
                top: topTPos + 'px',
                left: leftTPos + 'px',
                width: '160px',
                'max-width': '160px'
            });

            var $popup = $(popUpTmpl);
            var topPos = element.outerHeight() - 10;
            var leftPos = element.outerWidth() - scope.asNavDropdown.width + 20;
            
            element.after($popup);
            $popup.css({
                top: topPos + 'px',
                left: leftPos + 'px',
                width: scope.asNavDropdown.width + 'px',
                'max-width': scope.asNavDropdown.width + 'px'
            });
            $popup.find('.arrow').css('left', (scope.asNavDropdown.width - element.outerWidth()) + 'px');
            
            function showDropDown() {
                hideTooltip();
                $popup.css({display: 'block'});
                if (!_autoCloseEventBinded) {
                    bindAutoCloseEvents();
                }
            }
            function hideDropDown(e) {
                var target = $(e.target).closest('.link-profile');
                if(target.length <= 0) {
                    hideTooltip();
                    $popup.css({display: 'none'});
                    unbindAutoCloseEvents();
                }
            }
            function hideDropDown2() {
                hideTooltip();
                $popup.css({display: 'none'});
                unbindAutoCloseEvents();
            }
            function showTooltip() {
                if (!_autoCloseEventBinded) {
                    $tooltip.css({display: 'block'});
                }
            }
            function hideTooltip() {
                $tooltip.css({display: 'none'});
            }
            /*function stopEventPropagation (event) {
                event.stopPropagation();
            }*/
            function bindAutoCloseEvents() {
                $timeout(function() {
                    //$popup.on('click', stopEventPropagation);
                    $doc.on('click', hideDropDown);
                    $doc.on('keydown', hideDropDown2);
                    _autoCloseEventBinded = true;
                }, 0, false);
            }
            function unbindAutoCloseEvents() {
                if (_autoCloseEventBinded) {
                    //$popup.off('click', stopEventPropagation);
                    $doc.off('click', hideDropDown);
                    $doc.off('keydown', hideDropDown2);
                    _autoCloseEventBinded = false;
                }
            }
            function logout() {
                var apiUrl = wsEntryPoint + '/users/logout';
                $http.post(apiUrl, {'withCredentials': true}).then(function(resp) {
                    if(resp.data.success) {
                        $window.location.href = resp.data.message;
                    }
                    //console.log(resp);
                });
            }
            element.hover(function(){
                showTooltip();
            }, function(){
                hideTooltip();
            });

            element.click(showDropDown);

            $popup.on('click', '.menu-item', function(e) {
                hideDropDown2();
                $rootScope.platformpanel = true;
                $rootScope.panelData.menu = $(this).data('item');
                
                if ($rootScope.panelData.menu === 'logout') {
                    logout();
                }

                $rootScope.$apply();
            });
            
            $compile($popup.contents())(scope);
          }
        };
    }
]);
'use strict';

angular.module('bl.analyze.solar.surface')
  .constant('asMorePanelConfig', {
    mobileScreenWidth: '767'
  })
  .directive('asMorePanel', function () {
    var getID = function () {
      return 'morePanel-' + Math.random().toString(36).substr(2, 9);
    };
    var id = getID();
    return {
      restrict: 'E',
      template: [
        '<a class="toggle-more-panel icon icon-ui-info" as-tooltip tooltip-position="{{ position }}"',
        'tooltip-classes="more-tooltip {{classes}}" tooltip-content-dom="#', id,'"></a>',
        '<div id="', id,'" class="more-panel">',
          '<h5 class="title" ng-bind="panelTitle"></h5>',
          '<div class="inner" ng-transclude></div>',
        '</div>'].join(''),
      replace: false,
      transclude: true,
      scope: {
        panelTitle: '@',
        position: '@',
        classes: '@'
      },
      link: function (scope, element, attrs) {
      }
    };
  });

'use strict';

angular.module('bl.analyze.solar.surface')

  .directive('asMobileNavDropDown', function() {
    return {
      restrict: 'A',
      link: function(scope, element, attritubes) {
        $(element).mmenu({
          offCanvas: {
            position: attritubes['asMobileNavDropDown']
          },
          isMenu: false
        });
      }
    };
  });

'use strict';

angular.module('bl.analyze.solar.surface')
  .directive('asMeterBar', function () {
    function getPercent(min, max, value) {
      if (isNaN(min) || isNaN(max) || isNaN(value)) {
        return 0;
      }
      return Math.ceil((value - min) / (max - min) * 100);
    }

    return {
      restrict: 'E',
      require: 'ngModel',
      scope: {
        'min': '=',
        'max': '=',
        'ngModel': '='
      },
      template: ['<div class="meterbar-content"><div class="wrapper-minmax">',
                 '<span class="max" ng-bind="(max | number)">0</span>',
                 '<span class="min" ng-bind="(min | number)">0</span></div>',
                 '<progress max="100" value="{{percentageValue}}"/></div>'].join(''),
      link: function (scope, element, attrs) {
        scope.percentageValue = 0;
        scope.$watchGroup(['min', 'max', 'ngModel'], function(newValues, oldValues) {
          var min = parseFloat(newValues[0]),
              max = parseFloat(newValues[1]),
              value = parseFloat(newValues[2]);

          scope.percentageValue = getPercent(min, max, value);
        });
      }
    };
  });
'use strict';

angular.module('bl.analyze.solar.surface')
  .constant('asInfoPanelConfig', {
    placement: 'bottom right',
    hideDelay:'150',
    mobileScreenWidth: '767'
  })
  .directive('asInfoPanel', ['$position', '$timeout', 'asInfoPanelConfig',
    function ($position, $timeout, config) { /* it's using ui.bootstrap.position */
    // Not used: it's for dynamic dom injection by jquery

    //var appendPanel = function (element, placement, title) {
    //  var template = ['<div class="floating-panel dark more" style="width:200px;height:100px;">',
    //      '<div class="inner"><h5 class="title">', title, '</h5>',
    //      '<p>Panel Content</p>',
    //      '</div>',
    //      '</div>'].join(''),
    //    morePanel = $(template).appendTo(element),
    //    elementPosition = $position.position(element);
    //
    //  if (placement === 'right') {
    //    morePanel
    //      .css({top: elementPosition.top - 11, left: elementPosition.left + elementPosition.width + 20 })
    //      .addClass(placement) ;
    //  }
    //  morePanel.addClass(placement);
    //  element.morePanel = morePanel;
    //  return morePanel;
    //};

    /*var adjustToMiddle = function (element, placement) {
      var windowHeight = $(window).height(),
          elementPosition = $position.offset(element);
      var mScrollContainer = element.parent('.mCustomScrollbar'),
          mScrollContainerPosition = $position.offset(mScrollContainer);
      if (placement.indexOf('middle') < 0) {
        if (windowHeight <= elementPosition.top + elementPosition.height
          && elementPosition.top < mScrollContainerPosition.top) {
          return placement.replace(/[top|bottom]/, 'middle');
        }
      }
      return placement;
    };*/

    var adjustPlacement = function (element, placement) {
      var windowHeight = $(window).height(),
          elementPosition = $position.offset(element);
      var placements = placement.split(' ');

      if (placements.indexOf('bottom') > -1) {
        if (windowHeight <= elementPosition.top + elementPosition.height - $(document).scrollTop()) {
          return placement.replace('bottom', 'top');
        }
      }
      return placement;
    };

    var show = function (element, placement) {
      $(element).css({
        position:   'absolute',
        visibility: 'hidden',
        display:    'block'
      });

      var adjustedPlacement = adjustPlacement(element, placement);
      /*if (placement !== adjustedPlacement) {*/
        $(element).removeClass('top right bottom left below above').addClass(adjustedPlacement);
      /*}*/

      /*var anotherPlacement = adjustToMiddle(element, adjustedPlacement);
      if (anotherPlacement !== adjustedPlacement) {
        $(element).removeClass(adjustedPlacement).addClass(anotherPlacement);
      }*/

      $(element).attr('style', '').addClass('in').css({display:'block'});

      if (adjustedPlacement.search('middle') > -1) {
        $(element).css({
          marginLeft: -1 * $(element).width() / 2
        });
      }
      return adjustedPlacement;
    };

    var hide = function (element, delay) {
      /*$timeout(function () {
        $(element).stop(true).fadeOut('fast');
      }, delay);*/
      $(element).removeClass('in');
      $timeout(function () {
        $(element).css({display:'none'});
      }, delay);
    };

      return {
        restrict: 'E',
        template: ['<div class="floating-panel info fade {{ theme }} {{ placement }}"><div class="inner">',
                   '<div ng-transclude></div></div></div>'].join(''),
        transclude: true,
        replace: true,
        scope: {
          theme: '@',
          placement: '@'
        },
        link: function (scope, element, attrs) {
          var hideDelay = attrs.hideDelay || config.hideDelay,
            placement = attrs.placement;

          /*element.parent().on('mouseenter', function () {
            show(element, placement);
          }).on('mouseleave', function () {
            hide(element, hideDelay);
          });*/

          element.parent().hover(function () {
            var screenWidth = $(window).width();
            var mobileScreenWidth = config.mobileScreenWidth;
            console.log('screen width:' + screenWidth);
            if ( screenWidth <= mobileScreenWidth ) {
              return false;
            }
            placement = show(element, placement);
          }, function () {
            hide(element, hideDelay);
          });
        }
      };
    }
  ]);
'use strict';

angular.module('bl.analyze.solar.surface')
  .constant('asGlobalLoadingConfig', {
    animationDelay: 600,
    animationDuration: 400
  })
  .directive('asGlobalLoading', ['$timeout', '$document', 'asGlobalLoadingConfig', 'firstLoadEventList',
  function($timeout, $document, config, firstLoadEventList) {
    var originDocumentTitle = $document.prop('title');

    var fadeOutGlobalLoading = function (element) {
      $timeout(function () {
        element.css({opacity: 0});
        $timeout(function () {
          element.hide();
          $document.prop('title', originDocumentTitle);
        }, config.animationDuration);
      }, config.animationDelay);
    };

    var changeTitle = function (percentage) {
      $timeout(function () {
        $document.prop('title', percentage + '% Loaded');
      }, 60);
    };

    return {
      restrict: 'E',
      scope: {
        percentage: '='
      },
      link: function(scope, element, attrs) {
        $document.prop('title', '0% Loaded');

        $timeout(function () {
          scope.percentage = Math.ceil(100 / (firstLoadEventList.length+1));
        });

        var unregister = scope.$watch('percentage', function (newVal, oldVal) {
          /*if (!newVal) {
            newVal = Math.ceil(100 / (firstLoadEventList.length+1));
          }*/
          if (newVal !== oldVal) {
            element
              .find('.progress-bar')
              .css({'width': newVal+'%'})
              .find('.sr-only')
              .html(newVal + '% Completed');
            changeTitle(newVal);
            if (newVal > 99) {
              fadeOutGlobalLoading(element);
              unregister();
            }
          }
        });
      }
    };
  }]);

'use strict';

angular.module('bl.analyze.solar.surface')
  .constant('asElementShowLoadingConfig', {
    animationDelay: 150
  })
  .directive('asElementShowLoading', ['$timeout', 'asElementShowLoadingConfig', function($timeout, config) {
    return {
      restrict: 'A',
      link: function(scope, element, attrs) {
        var loadingOverlay = $('<div class="loading-animation fade"></div>').prependTo(element).hide();

        if (attrs.asElementShowLoading === 'true') {
          loadingOverlay.show().addClass('in'); // show
        }

        attrs.$observe('asElementShowLoading', function (value) {
          if (value === 'true') {
            loadingOverlay.show().addClass('in'); // show
          } else {
            loadingOverlay.removeClass('in'); // hide
            $timeout(function () {
              loadingOverlay.hide();
            }, config.animationDelay);
          }
        });

        scope.$on('SHOW_SOURCE_LOADING', function(event, broadCastArg) {
          if ( broadCastArg.showLoading === true ) {
            loadingOverlay.show().addClass('in');
          } else {
            loadingOverlay.hide();
          }
        });
      }
    };
  }]);
'use strict';

angular.module('bl.analyze.solar.surface')

  .constant('asDateRangeSelectorConfig', {
    labels: {
      'today':  'Today',
      'week':   '7 Days',
      'month':  '30 Days',
      'year':   '12 Months',
      'YTD':    'YTD',
      'total':  'Total'
    }
  })

  .controller('asDateRangeSelectorController',
    ['$scope', '$attrs', 'asDateRangeSelectorConfig',
     function ($scope, $attrs, config) {
       var attrRanges = $attrs.ranges || 'week, month, year',
           attrForceDropdown = $attrs.forceDropdown || false;

       $scope.showDropdown = !!attrForceDropdown;

       $scope.ranges = attrRanges.split(',').map(function (range) {
         return {
           'label': config.labels[range],
           'value': range
         };
       });

       $scope.selectRange = function (range) {
         $scope.ngModel = range;
       };
     }])

  .directive('asDateRangeSelector', function() {
    return {
      restrict: 'AE',
      scope: {
        ngModel: '='
      },
      controller: 'asDateRangeSelectorController',
      replace: false,
      template: [
        '<div class="controls element-date-range-selector-wrapper">',
          '<ul class="date-range-selector hidden-xs" ng-class="{hide: showDropdown}">',
            '<li ng-repeat="item in ranges" ng-class="{active: item.value == ngModel}">',
              '<a ng-click="selectRange(item.value)" ng-bind="item.label"></a>',
            '</li>',
          '</ul>',
          '<select class="date-range-selector" ng-model="ngModel" ',
          'ng-class="{\'show\': showDropdown, \'visible-xs\': !showDropdown}"',
          'ng-options="item.value as item.label for item in ranges"></select>',
        '</div>'].join(''),
      link: function(scope, element, attrs) {

      }
    };
  });
'use strict';

angular.module('bl.analyze.solar.surface')
  .directive('asDaterangePicker', 
    ['$rootScope', 'moment',
    function($rootScope, moment) {
      return {
        restrict: 'EA',
        replace: true,
        transclude: false,
        scope: true,
        template: ['<div class="date-range-picker">',
                    '<div class="date-el-wrapper">',
                    '<span class="dateLabel">From:</span><span class="dateValue" ng-bind="startDate"></span>',
                    '</div>',
                    '<div class="date-el-wrapper">',
                    '<span class="dateLabel">To:</span><span class="dateValue" ng-bind="endDate"></span>',
                    '</div>',
                    '</div>'].join(''),
        link: function(scope, element, attrs) {
          var rangeDays = parseInt(attrs.rangeDays) + 1;
          var id = attrs.id;

          var curTime = moment().unix();
          scope.endDate = moment.unix(curTime).add(-1, 'days').format('M/DD/YYYY');
          scope.startDate = moment.unix(curTime).add(0-rangeDays, 'days').format('M/DD/YYYY');

          element.find('.dateValue').dateRangePicker({
            format: 'M/DD/YYYY',
            separator : '-',
            container: '#' + id,
            showShortcuts: false,
            autoClose: true,
            startOfWeek: 'monday',
            endDate: scope.endDate,
            getValue: function() {
              if (scope.startDate && scope.endDate ) {
                return scope.startDate + '-' + scope.endDate;
              }
              else {
                return '';
              }
            },
            setValue: function(s,s1,s2) {
              scope.startDate = s1;
              scope.endDate = s2;

              scope.$apply();
            }
          });

          scope.$watchGroup(['startDate', 'endDate'], function(newValues, oldValues) {
            var start = newValues[0],
                end = newValues[1],
                oldStart = oldValues[0],
                oldEnd = oldValues[1],
                paramStart = 0,
                paramEnd = 0;

            if(start !== oldStart || end !== oldEnd) {
              paramStart = moment(start,['M/DD/YYYY']).unix();
              paramEnd = moment(end,['M/DD/YYYY']).unix();
              $rootScope.changedDateWeatherHistory(paramStart, paramEnd);
            }
          });
        }
      };
    }]);

'use strict';

angular.module('bl.analyze.solar.surface')
  .directive('asCurrentTime', ['$filter', function($filter){
    return function(scope, element, attrs){
      var format = attrs.format,
          isCapitalWeekDay = attrs.capitalweek || false;

      function updateTime(){
        var dt = $filter(isCapitalWeekDay ? 'asDate' : 'date')(new Date(), format);
        element.text(dt);
      }

      function updateLater() {
        setTimeout(function() {
          updateTime(); // update DOM
          updateLater(); // schedule another update
        }, 1000);
      }
      updateTime();
      updateLater();
    };
  }]);
'use strict';

angular.module('bl.analyze.solar.surface')
  .directive('asNavAppPanel', ['$compile', '$timeout', function($compile, $timeout) {
    var $doc = $(document);
    var _autoCloseEventBinded = false;
    var popUpTmpl = [
      '<div class="popover app-panel-popup bottom"><div class="arrow"></div>',
      '<div class="popover-content"><ul class="clearfix"></ul></div></div>'
    ].join('');

    return {
      restrict: 'AC',
      scope: {
          asNavAppPanel: '='
      },
      link: function (scope, element, attr) {
        var $tooltip = $('<div class="blue-box">Apps</div>');
        element.after($tooltip);

        var topTPos = element.outerHeight() + 7;
        var leftTPos = element.outerWidth() - 55;
        $tooltip.css({
            top: topTPos + 'px',
            left: leftTPos + 'px',
        });
        
        var $popup = $(popUpTmpl);
        var topPos = element.outerHeight() - 10;
        var leftPos = element.outerWidth() - scope.asNavAppPanel.width + 20;
        var div = '';
        element.after($popup);
        $popup.css({
            top: topPos + 'px',
            left: leftPos + 'px',
            width: scope.asNavAppPanel.width + 'px',
            'max-width': scope.asNavAppPanel.width + 'px'
        });
        $popup.find('.arrow').css('left', (scope.asNavAppPanel.width - element.outerWidth()) + 'px');
        angular.forEach( scope.asNavAppPanel.apps, function (app) {
            div = ['<li class="', app.className, '">',
                   '<a href="', app.linkTo, '" target="_blank"',
                   '><span class="icon"></span>',
                   app.label,
                   '</a></li>'].join('');
            $popup.find('.popover-content ul').append(div);
        });

        function showPanel() {
            hideTooltip();
            $popup.css({display: 'block'});
            if (!_autoCloseEventBinded) {
                bindAutoCloseEvents();
            }
        }
        function hidePanel(e) {
            var target = $(e.target).closest('.link-app-panel');
            if(target.length <= 0) {
                hideTooltip();
                $popup.css({display: 'none'});
                unbindAutoCloseEvents();
            }
        }
        function hidePanel2() {
            hideTooltip();
            $popup.css({display: 'none'});
            unbindAutoCloseEvents();
        }
        function showTooltip() {
            if (!_autoCloseEventBinded) {
                $tooltip.css({display: 'block'});
            }
        }
        function hideTooltip() {
            $tooltip.css({display: 'none'});
        }
        /*function stopEventPropagation (event) {
            event.stopPropagation();
        }*/
        function bindAutoCloseEvents() {
            $timeout(function() {
                //$popup.on('click', stopEventPropagation);
                $doc.on('click', hidePanel);
                $doc.on('keydown', hidePanel2);
                _autoCloseEventBinded = true;
            }, 0, false);
        }
        function unbindAutoCloseEvents() {
            if (_autoCloseEventBinded) {
                //$popup.off('click', stopEventPropagation);
                $doc.off('click', hidePanel);
                $doc.off('keydown', hidePanel2);
                _autoCloseEventBinded = false;
            }
        }
        //element.on('hover', showPanel);
        element.hover(function(){
            showTooltip();
        }, function(){
            hideTooltip();
        });
        element.click(showPanel);
        $popup.on('click', '.app-link', hidePanel2);
        $compile($popup.contents())(scope);
      }
    };
  }]);
'use strict';

angular.module('bl.analyze.solar.surface')
  .directive('asAnimatedNumber', function() {
    return {
      restrict: 'AE',
      scope: true,
      link: function(scope, element, attrs) {
        var animationLength, numDecimals, option;
        numDecimals = 0;
        animationLength = 2;
        if (attrs.compress) {
          option = {
            useCompress: true
          };
          if (attrs.nosuffix) {
            option.compressSuffix = ['', ''];
          }
          numDecimals = 2;
        } else {
          if ((attrs.numDecimals !== null) && attrs.numDecimals >= 0) {
            numDecimals = attrs.numDecimals;
          }

          if ((attrs.animationLength !== null) && attrs.animationLength > 0) {
            animationLength = attrs.animationLength;
          }
        }
        return scope.$watch(attrs.ngBind, function(newVal, oldVal) {
          if (!oldVal || isNaN(oldVal)) {
            oldVal = 0;
          }
          if (!newVal || isNaN(newVal)) {
            newVal = 0;
          }
          if (newVal !== oldVal) {
            return new countUp(element[0], oldVal, newVal, numDecimals, animationLength, option).start();
          }
        });
      }
    };
  });

'use strict';

angular.module('bl.analyze.solar.surface')

.filter('truncate', function () {
  return function (value, wordwise, max, tail) {
    if (!value) { return ''; }

    max = parseInt(max, 10);
    if (!max) { return value; }
    if (value.length <= max) { return value; }

    value = value.substr(0, max);

    if (wordwise) {
      var lastspace = value.lastIndexOf(' ');
      if (lastspace !== -1) {
        value = value.substr(0, lastspace);
      }
    }

    return value + (tail || ' …');
  };
});
'use strict';

angular.module('bl.analyze.solar.surface')
  .filter('asShortNumber', ['$filter', function ($filter) {
    return function(number) {
      if (parseFloat(number) < 0) {
        return $filter('number')(number, 2);
      }

      number = parseInt(number);
      if (number >= 1000000000) {
        number = $filter('number')(number / 1000000, 0) + 'm';
      } else if (number >= 1000000) {
        number = $filter('number')(number / 1000000, 1) + 'm';
      } else if (number >= 100000) {
        number = $filter('number')(number / 1000, 0) + 'k';
      } else if (number >= 1000) {
        number = $filter('number')(number / 1000, 1) + 'k';
      }

      return number;
    };
  }]);
'use strict';

angular.module('bl.analyze.solar.surface')
  .filter('asDate', ['$filter', function ($filter) {
    return function (date, format) {
      // Add custom format
      // Convert Mon, April 1 to MON, April 1
      // Make English Weekday to uppercase

      var decorated = $filter('date')(date, format);

      var regEx = /(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/,
          pos = decorated.search(regEx);

      if (pos > -1) {
        return decorated.replace(regEx, decorated.substr(pos, 3).toUpperCase());
      } else {
        return decorated;
      }
    };
  }]);
'use strict';

angular.module('bl.analyze.solar.surface')
  .controller('SelectionPanelController',
  ['$scope', '$modal', '$timeout', 'solarTagService', 'powerService', 'energyService', 'weatherService',
    'SourceSelectionEventService', 'facilityDetailsService', '$filter',
    function ($scope, $modal, $timeout, solarTagService, powerService, energyService, weatherService,
              SourceSelectionEventService, facilityDetailsService, $filter) {

      // Init scope variables
      $scope.powerInfo = {
        current: 0,
        currentDayAvg: 0.5,
        minAvg: 0,
        maxAvg: 1,
        potential: 0,
        unit: 'kW'
      };

      $scope.energyInfo = {
        today: 0,
        utilitySavingToday: 0,
        utilitySavingMonth: 0,
        minAvg: 5,
        maxAvg: 30,
        unit: 'kWh'
      };

      $scope.todayWeather = {
        temperature: {
          now: 0,
          min: 0,
          max: 0
        },
        cityName: 'Kansas City',
        air: {
          humidity: 0,
          pressure: 0,
          windSpeed: 0
        },
        sunTime: {
          sunset: '',
          sunrise: ''
        }
      };

      $scope.lastSunnyDay = {
        day: '2015-03-23T00:00:00.000Z',
        energy: 944
      };

      $scope.foreWeather = [];
      $scope.historicalWeather = [];

      $scope.facilities = [];
      $scope.selectedFacilities = [];
      $scope.selectedScopes = [];
      $scope.selectedNodes = [];
      $scope.countNodes = 0;
      $scope.isSourceListLoaded = false;
      $scope.isSelectAll = true;

      $scope.isWeatherHistoryShown = false;

      $scope.toggleWeatherHistory = function () {
        $scope.isWeatherHistoryShown = !$scope.isWeatherHistoryShown;
      };

      $scope.loadFacilityList = function (newFacilityList) {
        $scope.isSourceListLoaded = true;
        $scope.facilities = newFacilityList;
      };

      $scope.initLoads = function () {
        solarTagService
          .getAll()
          .then(function (facilities) {
            angular.forEach(facilities, function (facility) {
              $scope.powerInfo.potential += facility.potentialPower;
              $scope.countNodes += facility.nodesCount;//facility.scopes.length;
              $scope.countScopes += facility.scopes.length;
              $scope.isSelectAll = $scope.isSelectAll && facility.selected;
            });
            return facilities;
          })
          .then(function (facilities) {
            checkSourcesSelectedStatus(facilities);
            $scope.loadFacilityList(facilities);
            solarTagService.watchAllSolarTags($scope.loadFacilityList.bind($scope));
          });

        powerService
          .watchCurrentPower(function (data) {
            console.log('currentPower info:', data);
            angular.extend($scope.powerInfo, data);
          });

        energyService
          .watchCurrentEnergy(function (data) {
            console.log('currentEnergy info:', data);
            angular.extend($scope.energyInfo, data);
          })
          .getLastSunnyDayEnergy(function (data) {
            console.log('lastSunnyDay Energy Info: ', data);
            $scope.lastSunnyDay = data;
          });

        weatherService
          .watchWeather(function (data) {
            $scope.todayWeather = data.todayWeather;
            $scope.historicalWeather = data.historicalWeather;
            $scope.foreWeather = data.foreWeather;
          });
      };

      $scope.showFacilityDetails = function (selectedFacility) {
        if ($('.drilldown.modal').hasClass('in')) {
          $timeout(function () {
            $('.drilldown.modal.in a.drilldown-close').click();
          }, 1);
        }

        var modalInstance = $modal.open({
          templateUrl: 'app/partials/facility-details.html',
          controller: 'facilityDetailsController',
          windowClass: 'drilldown',
          size: 'lg'
        });

        facilityDetailsService.setDetailsValues(selectedFacility);
        
        modalInstance.opened.then(function () {
          $timeout(function () {
            $('.drilldown.modal').addClass('opened-sp');
          }, 1);
        });
      };

      function checkSourcesSelectedStatus (facilities) {
        angular.forEach(facilities, function (facility) {
          if (!facility.scopes.length) { return; }

          var childrenStatusSum = false;
          facility.countSelectedChilds = 0;
          angular.forEach(facility.scopes, function (scope) {

            var nodeStatusSum = false;
            scope.countSelectedChilds = 0;
            angular.forEach(scope.nodes, function(node) {
              nodeStatusSum = nodeStatusSum || node.selected;
              if (node.selected) { scope.countSelectedChilds++; }
            });

            scope.selected = nodeStatusSum;
            childrenStatusSum = childrenStatusSum || scope.selected;
            if (scope.selected) {
              facility.countSelectedChilds++;
            }
            // ToDo: Node selection/deselection
          });

          facility.selected = childrenStatusSum;
        });
      }

      function setSourceSelectionRecursively (source, selected) {
        source.selected = !!selected;
        if ((source.scopes && !source.scopes.length) ||
            (source.nodes && !source.nodes.length) ||
            (!source.nodes && !source.scopes)) {
          return ;
        }
        var children = source.scopes ? 'scopes' : 'nodes';
        angular.forEach(source[children], function (child) {
          setSourceSelectionRecursively(child, !!selected);
        });
      }

      function notifySourceSelection(message, sourceId) {
        if($('.source-notify').length) {
          return;
        }

        var $alert = $('<div class="source-notify">'
          + '<div class="source-notify-arrow"></div>'
          + '<div class="source-notify-icon"></div>'
          + '<div class="source-notify-message">' + message + '</div></div>');
        
        $(document.body).append($alert);
        
        var offset = $('#' + sourceId).parents('li').offset();
        $alert.css({left: offset.left - 12, top: offset.top - $(window).scrollTop() - 60});
        $alert.fadeIn(200, function() {
          $timeout(function() {
            $alert.fadeOut(400, function() {
              $alert.remove();
            });
          }, 3000);
        });
      }

      $scope.toggleSelectSource = function (source, sourceType) {
        // Todo: Prevent user from deselect all sources
        var toggledStatus = source.selected;

        if (!toggledStatus) { // when user is going to deselect the all sources
          var countNodesGoingToBeDeselected = 0;
          countNodesGoingToBeDeselected = source.nodes ? source.nodes.length : 1;
          if ($scope.selectedNodes.length - countNodesGoingToBeDeselected  === 0) {
            source.selected = !source.selected;   // restore origin status

            //alert('Sorry, but you can\'t deselect whole sources.');
            var sourceId = sourceType + '-' + source.id;
            notifySourceSelection('You must have at least one source selected', sourceId);
            
            return;
          }
        }
        setSourceSelectionRecursively(source, toggledStatus);
        checkSourcesSelectedStatus($scope.facilities);
        $scope.getSelectedSources();
        $scope.facilities = $filter('orderBy')($scope.facilities, 'selected', true);

        $scope.isSourceListLoaded = false;
        
        SourceSelectionEventService.broadcast($scope.selectedFacilities, $scope.selectedScopes, $scope.selectedNodes);
      };
      
      $scope.getSelectedSources = function () {

        $scope.selectedFacilities = [];
        $scope.selectedScopes = [];
        $scope.selectedNodes = [];
        var selectedFacility = $scope.facilities.filter(function (f) {
          return f.selected;
        });
        $scope.selectedFacilities = selectedFacility.map(function (f) {
          $scope.selectedScopes = $scope.selectedScopes.concat(f.scopes.filter(function (s) {
            return s.selected;
          }).map(function (s) {
            $scope.selectedNodes = $scope.selectedNodes.concat(s.nodes.filter(function (n) {
              return n.selected;
            }).map(function (n) {
              return n.id;
            }));
            return s.id;
          }));
          return f.id;
        });

        // Should check if all source is selected
        if ($scope.countNodes === $scope.selectedNodes.length) {
          $scope.selectedFacilities = [];
          $scope.selectedScopes = [];
          $scope.selectedNodes = [];
        }
      };

      $scope.toggleExpandSource = function (source) {
        if (!source.expanded) {
          source.expanded = true;
        } else {
          source.expanded = !source.expanded;
        }
      };

      $scope.toggleSelectAllSource = function () {
        $scope.isSelectAll = !$scope.isSelectAll;
        //console.time('toggleSelectAllSource');

        angular.forEach($scope.facilities, function (facility) {
          setSourceSelectionRecursively(facility, $scope.isSelectAll);
        });

        if (!$scope.isSelectAll) { // if User clicked 'Deselect All'
          // Select the first facility in case of User clicked the 'Deselect All'
          setSourceSelectionRecursively($scope.facilities[0], true);
        }

        $scope.getSelectedSources();
        //console.timeEnd('toggleSelectAllSource');
        SourceSelectionEventService.broadcast($scope.selectedFacilities, $scope.selectedScopes);
      };

      $scope.getTextSummary = function (weatherIcon, currentPower, sunSetTime, sunRiseTime) {
        if (weatherIcon === 'clear-day') {
          // to skip jshint error
          console.log(weatherIcon);
        }
      };

      $scope.initLoads();
    }
  ]);
'use strict';

angular.module('bl.analyze.solar.surface')
  .controller('TopNavBarController', ['$scope', '$rootScope', '$modal', 'userService',
    function ($scope, $rootScope, $modal, userService) {
      $scope.userInfo = {
        username: 'BP',
        fullname: 'Ben Padric',
        accountname: 'Brightergy',
        online: true
      };

      $scope.navDropdownConf = {
        width: 200,
        height: 140,
      };

      $scope.appPanelConf = {
        width: 300,
        height: 300,
        apps: [
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
            linkTo: '/coming-soon'
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
        ]
      };

      $rootScope.panelData = {
        user: window.renderCurrentUser
      };
      
      //$rootScope.apiDomain = window.apiDomain;
    }
  ]);
'use strict';

angular.module('bl.analyze.solar.surface')
  .controller('MainStageController', ['$scope', 'SourceSelectionEventService',
    function ($scope, SourceSelectionEventService) {
      $scope.init = function () {
        console.log('Main Stage init');
      };


      // empty array means all facilities/scopes are selected;
      $scope.selectedFacilities = [];
      $scope.selectedScopes = [];

      SourceSelectionEventService.listen(function (event, selectedFacilities, selectedScopes) {
        $scope.selectedFacilities = selectedFacilities;
        $scope.selectedScopes = selectedScopes;
        console.log('Hello I am receiving selected sources');
        console.log(selectedFacilities);
        console.log(selectedScopes);
      });

    }
  ]);
'use strict';

angular.module('bl.analyze.solar.surface')
    .controller('HelpCenterController', ['$scope', '$location',
        function ($scope, $location) {

        	$scope.articleView = false;
        	$scope.homeView = true;

        	$scope.openTicketCount = 2;

        	$scope.knowledgeArticles = [
        		{
        			title: 'Real-Time Power'
        		},
        		{
        			title: 'Reimbursement Saving'
        		},        		
        		{
        			title: 'Energy'
        		},        		
        		{
        			title: 'Avoided Carbon'
        		},        		
        		{
        			title: 'Total Energy Production'
        		},        		
        		{
        			title: 'Yield Comparison'
        		},        		
        		{
        			title: 'Equivalencies'
        		},        		
        		{
        			title: 'Generated vs Predicted'
        		},        		
        		{
        			title: 'Power Plant Details'
        		},        		
        		{
        			title: 'Irradiance vs Energy'
        		}
        	];

        	$scope.staticGlossary =
            ['Popular','All','A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T',
              'U','V','W','X','Y','Z'];

          $scope.filteredGlossary = ['kW','kwH','Current weather','Production','Carbon','Irradiance','Power','Energy',
                                      'Drildown','Real-time power','Equivalencies'];

          $scope.faqArticles = [
            {
              title: 'Lorem ipsum dolor sit amet, consectetuer adipiscing elit, sed diam nonummy nibh euismod ' +
                     'tincidunt ut laoreet dolore magna consectetuer adipiscing elit, aliquam erat volutpat?'
            },
            {
              title: 'Sed diam nonummy nibh euismod tincidunt ut laoreet dolore magna aliquam erat volutpat?'
            },
            {
              title: 'Consectetuer adipiscing elit, Sed diam nonummy nibh euismod tincidunt ut laoreet dolore ' +
                     'magna aliquam erat volutpat?'
            },
            {
              title: 'Lorem ipsum dolor sit amet, consectetuer adipiscing elit, sed diam nonummy nibh euismod ' +
                     'tincidunt ut laoreet dolore magna consectetuer adipiscing elit, aliquam erat volutpat?'
            },
            {
              title: 'Sed diam nonummy nibh euismod tincidunt ut laoreet dolore magna aliquam erat volutpat?'
            },
            {
              title: 'Consectetuer adipiscing elit, Sed diam nonummy nibh euismod tincidunt ut laoreet dolore ' +
                     'magna aliquam erat volutpat?'
            }
          ];

          $scope.closeHelp = function() {
            $location.path('/main', false);
          };

          $scope.goArticle = function() {
            $scope.articleView = true;
            $scope.homeView = false;
          };
        }
    ]);
'use strict';

angular.module('bl.analyze.solar.surface')
	.controller('facilityDetailsController', ['$scope', '$modalInstance', '$timeout', 'facilityDetailsService', 
		function ($scope, $modalInstance, $timeout, facilityDetailsService) {
			$scope.areaChartConfig = {};
			$scope.constYear = parseInt(moment().format('YYYY'));
			$scope.currentYear = parseInt(moment().format('YYYY'));
			$scope.prevYear = $scope.currentYear - 1;
			$scope.nextYear = $scope.currentYear + 1;

	        $scope.init = function() {				
				$scope.currentFacility = {
					'operator': 'Brightergy LLC',
					'predicted_ag': '32,480 kWh',
					'predicted_ca': '22.7 tons',
					'description': ''
				};
				
                $timeout(function() {
                    $(window).trigger('resize');
                }, 10);
			};

			$scope.closeDrilldown = function() {
				$modalInstance.dismiss('cancel');
				$('.drilldown.modal').removeClass('opened-sp');
			};

			$scope.drawChart = function () {

			};

			$scope.changeYear = function() {
				$scope.nextYear = $scope.currentYear + 1;
				$scope.prevYear = $scope.currentYear - 1;
				facilityDetailsService.changeYear($scope.currentYear);
			};

			$scope.getPrevYearData = function() {
				$scope.currentYear--;
				$scope.changeYear();
			};

			$scope.getNextYearData = function() {
				$scope.currentYear++;
				$scope.changeYear();
			};

			$scope.selectPPDTabs = function() {
				$('#ppdAreaChart').hide();
				$timeout(function() {
					$(window).trigger('resize');
				}, 100);
				$timeout(function() {
					$('#ppdAreaChart').show();				
				}, 300);
			};
		        	
		    $scope.init();
		}
	]);

$(document).ready(function () {
  if ($(window).width() < 1900) {
    $('body').addClass('collapsed');
    $('#wrapper').addClass('collapsed');
  }
});
angular.module("bl.analyze.solar.surface").run(["$templateCache", function($templateCache) {$templateCache.put("partials/facility-details.html","<div id=\"powerplantdetails-modal\">\r\n	<div class=\"clearfix\">\r\n		<div class=\"col-md-12 no-padding\">\r\n			<div class=\"element powerplant-details\">\r\n				<div class=\"loading-animation\" ng-hide=\"ppdLoaded\"></div>\r\n				<div class=\"header\">\r\n					<h5 class=\"title\">\r\n						<as-more-panel class=\"as-more-panel\" position=\"bottom left\" panel-title=\"Power Plant Details\">\r\n							<div ng-include=\"\'app/partials/more-panels/facility-detail.html\'\"></div>\r\n						</as-more-panel>\r\n						Power Plant Details\r\n					</h5>\r\n					<a class=\"drilldown-close\" ng-click=\"closeDrilldown()\"></a>\r\n				</div>\r\n				<div class=\"ppd-elwrapper\">\r\n					<div class=\"widget\">\r\n						<div class=\"row\">\r\n							<div class=\"col-md-6\">\r\n								<div class=\"ppd-row\">\r\n									<div class=\"ppd-label\">Location</div>\r\n									<div class=\"ppd-value\"><strong>{{facilityLocation}}</strong></div>\r\n								</div>\r\n								<div class=\"ppd-row\">\r\n									<div class=\"ppd-label\">Operator</div>\r\n									<div class=\"ppd-value\"><strong>{{currentFacility.operator}}</strong></div>\r\n								</div>\r\n								<div class=\"ppd-row\">\r\n									<div class=\"ppd-label\">Commissioning</div>\r\n									<div class=\"ppd-value\"><strong>{{facilityCommissioning}}</strong></div>\r\n								</div>\r\n								<div class=\"ppd-row has-padding\">\r\n									<div class=\"ppd-label\">Potential Power</div>\r\n									<div class=\"ppd-value\"><strong><span class=\"text-orange\">{{facilityPotentialPower}} kWp</span></strong></div>\r\n								</div>\r\n								<div class=\"ppd-row\">\r\n									<div class=\"ppd-label\">Predicted Annual Generation</div>\r\n									<div class=\"ppd-value\"><strong>Approx. <span class=\"text-orange\">{{currentFacility.predicted_ag}}</span></strong></div>\r\n								</div>\r\n								<div class=\"ppd-row\">\r\n									<div class=\"ppd-label\">Predicted Carbon Avoided</div>\r\n									<div class=\"ppd-value\"><strong>Approx. <span class=\"text-orange\">{{currentFacility.predicted_ca}}</span> per annum</strong></div>\r\n								</div>\r\n								<!--div class=\"ppd-row has-padding\">\r\n									<div class=\"ppd-label\">Description</div>\r\n									<div class=\"ppd-value\">{{currentFacility.description}}</div>\r\n								</div-->\r\n							</div>\r\n							<div class=\"col-md-6 ppd-mapphoto\">\r\n								<div class=\"col-md-6 map-wrapper\" id=\"ppdmap_container\">\r\n								</div>\r\n								<div class=\"col-md-6 ppd-photo\">\r\n									<img src=\"/assets/img/temp/powerplant_detail_img1.png\" />\r\n								</div>\r\n							</div>\r\n						</div>\r\n					</div>\r\n				</div>\r\n				<div class=\"widget\">\r\n					<div class=\"ppd-charts\">\r\n						<tabset>\r\n							<tab heading=\"Real-Time Power\" class=\"first\" ng-click=\"selectPPDTabs()\">\r\n								<div class=\"chart-container\">\r\n									<highchart id=\"ppdAreaChart\" config=\"facilityDetailRealTimePowerChartConfig\" style=\"width:100%\"></highchart>\r\n								</div>\r\n							</tab>\r\n							<tab heading=\"Energy\" class=\"last\" ng-click=\"selectPPDTabs()\">\r\n								<div class=\"widget-header\">\r\n									<div class=\"col-md-4 text-left\">\r\n										<a ng-click=\"getPrevYearData()\" ng-show=\"prevEnergyYear != \'\'\">\r\n											<span class=\"icon-arrow left\"></span> <span class=\"text-graylighter\">{{prevYear}}</span>\r\n										</a>\r\n									</div>\r\n									<div class=\"col-md-4 text-center\">\r\n										<span class=\"text-graylighter\">Year {{currentYear}}</span>\r\n									</div>\r\n									<div class=\"col-md-4 text-right\">\r\n										<a ng-click=\"getNextYearData()\" ng-show=\"nextYear != \'\' && currentYear <constYear\">\r\n											<span class=\"text-graylighter\">{{nextYear}}</span><i class=\"icon-arrow right\"></i>\r\n										</a>\r\n									</div>		\r\n									<div class=\"clearfix\"></div>	\r\n								</div>\r\n								<div class=\"clearfix\"></div>\r\n								<highchart id=\"facilityDetailEnergyChart\" config=\"facilityDetailEnergyChartConfig\" style=\"width:100%\"></highchart>\r\n								<div class=\"footer\">\r\n									<div class=\"kpis\">\r\n										<div class=\"kpi\" ng-show=\"totalFacilityEnergyGenerated != 0\">\r\n											<div class=\"kpi-title\">Total Production</div>\r\n											<div class=\"kpi-value\">\r\n												{{totalFacilityEnergyGenerated | number:0 }}\r\n												<span class=\"unit\">kWh</span>\r\n												<sup class=\"animated  as-sink\" ng-show=\"totalFacilityEnergyGeneratedTrend == \'down\'\">↓</sup>\r\n												<sup class=\"animated  as-float\" ng-show=\"totalFacilityEnergyGeneratedTrend == \'up\'\">↑</sup>\r\n											</div>\r\n										</div>\r\n									</div>\r\n								</div>\r\n							</tab>\r\n						</tabset>\r\n					</div>\r\n				</div>\r\n			</div>\r\n		</div>\r\n	</div>\r\n</div>");
$templateCache.put("partials/help.html","<div id=\"help-panel\">\r\n    <div class=\"inner-wrapper\">\r\n        <div class=\"help-header\">\r\n            <h3>Help Center</h3>\r\n            <a class=\"close\" ng-click=\"closeHelp()\">×</a>\r\n        </div>\r\n        <div class=\"help-search-wrapper\">\r\n            <div class=\"row\">\r\n                <div class=\"col-md-6\">\r\n                    <form class=\"form-help-search\">\r\n                        <div class=\"search-input-wrapper\">\r\n                            <input type=\"text\" placeholder=\"How can we help you?\" />\r\n                            <button type=\"submit\" class=\"btn-submit icon icon-ui-search\"></button>\r\n                        </div>\r\n                    </form>\r\n                </div>\r\n                <div class=\"col-md-6\">\r\n                    <ul class=\"list-inline nav-list pull-right\">\r\n                        <li>\r\n                            <a href=\"#\"><span class=\"badge\">2</span></a>\r\n                        </li>\r\n                        <li>\r\n                            <a>Open Tickets</a>\r\n                        </li>\r\n                        <li>\r\n                            <a>Resolved</a>\r\n                        </li>\r\n                    </ul>\r\n                </div>\r\n            </div>\r\n        </div>\r\n        <div class=\"help-content\">\r\n            <div class=\"row\">\r\n                <div class=\"col-md-8\" ng-show=\"articleView\">\r\n                    <div class=\"subbox article-box\">\r\n                        <div class=\"header\"><h3>Current Power</h3></div>\r\n                        <div class=\"contents contentHelpArticle\">\r\n                            <p>Your system is currently producing 0.8 kilowatts (kW) of power out of a potential at 25 kW.</p>\r\n                            <p>Your power will rise and fall throughout the day depending on the availability of sunlight, but 8 kW is above your current average of 5 kW for the day.</p>\r\n                            <img src=\"/assets/img/help-article-sample.png\" alt=\"\" />\r\n                        </div>\r\n                    </div>\r\n                </div>\r\n\r\n                <div class=\"col-md-4\">\r\n                    <div class=\"subbox knowledge-box\" ng-class=\"{\'has-border\': articleView}\">\r\n                        <div class=\"header\"><h3>Knowledge base</h3></div>\r\n                        <div class=\"contents\">\r\n                            <ul>\r\n                                <li ng-repeat=\"article in knowledgeArticles\"><a ng-click=\"goArticle()\">{{article.title}}</a></li>\r\n                            </ul>\r\n                        </div>\r\n                    </div>\r\n\r\n                    <div class=\"subbox contact-box\" ng-class=\"{\'has-border\': articleView}\">\r\n                        <div class=\"header\"><h3>Contact Support</h3></div>\r\n                        <div class=\"description\">If you can not find information you need in our Knowledge Base or term definition in Glossary, please send your question to our support.</div>\r\n                        <div class=\"contents\">\r\n                            <div class=\"form-row\">\r\n                                <input type=\"text\" placeholder=\"Subject\" />\r\n                            </div>\r\n                            <div class=\"form-row\">\r\n                                <textarea placeholder=\"Message\"></textarea>\r\n                            </div>\r\n                            <div class=\"form-row\">\r\n                                <button>Send Message</button>\r\n                            </div>\r\n                        </div>\r\n                    </div>\r\n                </div>\r\n\r\n                <div class=\"col-md-8\" ng-show=\"homeView\">\r\n                    <div class=\"subbox glossary-box\" ng-class=\"{\'has-border\': homeView}\">\r\n                        <div class=\"header\"><h3>Glossary</h3></div>\r\n                        <div class=\"contents\">\r\n                            <ul class=\"list-inline\">\r\n                                <li ng-repeat=\"tag in staticGlossary\"><a ng-click=\"goArticle()\">{{tag}}</a></li>\r\n                            </ul>\r\n                            <ul class=\"list-inline\">\r\n                                <li ng-repeat=\"tag in filteredGlossary\"><a ng-click=\"goArticle()\">{{tag}}</a></li>\r\n                            </ul>\r\n                            <a class=\"more-link\">Show More</a>\r\n                        </div>\r\n                    </div>\r\n\r\n                    <div class=\"subbox faq-box\" ng-class=\"{\'has-border\': homeView}\">\r\n                        <div class=\"header\"><h3>Frequently Asked Questions</h3></div>\r\n                        <div class=\"contents\">\r\n                            <ul>\r\n                                <li ng-repeat=\"article in faqArticles\"><a ng-click=\"goArticle()\">{{article.title}}</a></li>\r\n                            </ul>\r\n                        </div>\r\n                    </div>\r\n                </div>\r\n            </div>\r\n        </div>\r\n    </div>\r\n</div>");
$templateCache.put("partials/main-stage.html","<!--<div class=\"kpi-group-mobile\">\r\n    <div class=\"sp-kpi-group\">\r\n        <div class=\"row\">\r\n            <div class=\"col-xs-6\">\r\n                <div class=\"wrapper-kpi\">\r\n                    <as-meter-bar min=\"0.1\" max=\"2.3\" ng-model=\"currentPower\"></as-meter-bar>\r\n                    <div class=\"numeric-content\">\r\n                        <span class=\"kpi-title\">Current Power</span>\r\n                        <b class=\"kpi-value\">\r\n                            0.8\r\n                            <sup>kW</sup>\r\n                        </b>\r\n                    </div>\r\n                </div>\r\n            </div>\r\n            <div class=\"col-xs-6\">\r\n                <div class=\"wrapper-kpi\">\r\n                    <as-meter-bar min=\"12\" max=\"39\" ng-model=\"currentEnergy\"></as-meter-bar>\r\n                    <div class=\"numeric-content\">\r\n                        <span class=\"kpi-title\">Today\"s Energy</span>\r\n                        <b class=\"kpi-value\">\r\n                            18\r\n                            <sup>kWh</sup>\r\n                        </b>\r\n                    </div>\r\n                </div>\r\n            </div>\r\n        </div>\r\n    </div>\r\n</div>-->\r\n<div id=\"wrapper-main-stage\" class=\"as-grid-container\">\r\n    <div class=\"as-col-xl-8 as-col-lg-12 as-col-sm-12\">\r\n        <div class=\"element-wrapper tall\">\r\n            <element-solar-energy-generation></element-solar-energy-generation>\r\n        </div>\r\n    </div>\r\n    <div class=\"as-col-xl-4 as-col-lg-4 as-col-sm-12\">\r\n        <div class=\"as-grid-container\">\r\n            <div class=\"as-col-lg-6 as-col-md-3 as-col-sm-4\">\r\n                <div class=\"element-wrapper\">\r\n                    <element-savings></element-savings>\r\n                </div>\r\n            </div>\r\n            <div class=\"as-col-lg-6 as-col-md-3 as-col-sm-hidden\">\r\n                <div class=\"element-wrapper\">\r\n                    <element-total-energy-generation></element-total-energy-generation>\r\n                </div>\r\n            </div>\r\n            <div class=\"as-col-lg-12 as-col-md-6 as-col-sm-8\">\r\n                <div class=\"element-wrapper\">\r\n                    <element-equivalencies></element-equivalencies>\r\n                </div>\r\n            </div>\r\n        </div>\r\n    </div>\r\n    <div class=\"as-col-xl-6 as-col-lg-8 as-col-md-12 as-col-sm-12\">\r\n        <div class=\"element-wrapper tall\">\r\n            <element-realtime-power></element-realtime-power>\r\n        </div>\r\n    </div>\r\n    <div class=\"as-col-xl-6 as-col-lg-12 as-col-sm-12\">\r\n        <div class=\"as-grid-container\">\r\n            <div class=\"as-col-xl-hidden as-col-lg-hidden as-col-md-hidden as-col-sm-4 as-col-xs-hidden\">\r\n                <div class=\"element-wrapper\">\r\n                    <element-total-energy-generation></element-total-energy-generation>\r\n                </div>\r\n            </div>\r\n            <div class=\"as-col-xl-12 as-col-lg-4 as-col-md-6 as-col-sm-8 has-zindex-1\">\r\n                <div class=\"element-wrapper\">\r\n                    <element-annual-energy-generation-comparision></element-annual-energy-generation-comparision>\r\n                </div>\r\n            </div>\r\n            <div class=\"as-col-xl-8 as-col-lg-6 as-col-md-6 as-col-sm-8\">\r\n                <div class=\"element-wrapper\">\r\n                    <actual-predicted-energy></actual-predicted-energy>\r\n                </div>\r\n            </div>\r\n            <div class=\"as-col-xl-4 as-col-lg-2 as-col-md-4 as-col-sm-4\">\r\n                <div class=\"element-wrapper\">\r\n                    <element-avoided-carbon></element-avoided-carbon>\r\n                </div>\r\n            </div>\r\n        </div>\r\n    </div>\r\n    <!--<div class=\"as-col-xl-10 as-col-lg-12 as-col-sm-8\">\r\n        <div class=\"element-wrapper\">\r\n            <element-energy-by-sunhours></element-energy-by-sunhours>\r\n        </div>\r\n    </div>-->\r\n</div>\r\n");
$templateCache.put("partials/navigation-bar.html","<nav class=\"navbar navbar-default glob-nav\">\r\n    <div class=\"container-fluid\">\r\n        <div class=\"navbar-header\"><a href=\"#!/main\" class=\"navbar-brand\">\r\n            <div class=\"brand-image\" ng-click=\"$root.platformpanel=false\"></div>\r\n            <div class=\"icon icon-brighterlink\"></div><span class=\"large-space\">Analyze Solar</span><span class=\"grey-color\">Surface</span></a></div>\r\n        <ul class=\"nav navbar-links\">\r\n            <li><a as-nav-app-panel=\"appPanelConf\" class=\"link-app-panel\"></a></li>\r\n            <li><a as-nav-dropdown=\"navDropdownConf\" user-info=\"userInfo\" class=\"link-profile\"><span ng-class=\"{\'online\': userInfo.online}\"></span>{{userInfo.username}}</a></li>\r\n        </ul>\r\n        <!--button type=\"button\" data-toggle=\"collapse\" data-target=\"#ass-mobile-nav\" class=\"navbar-toggle collapsed\"><span class=\"sr-only\">Toggle navigation</span><span class=\"icon-bar\"></span><span class=\"icon-bar\"></span><span class=\"icon-bar\"></span></button-->\r\n        <a href=\"#mobile-dropdown-menu\" class=\"navbar-toggle\"><span class=\"sr-only\">Toggle navigation</span><span class=\"icon-bar\"></span><span class=\"icon-bar\"></span><span class=\"icon-bar\"></span></a>\r\n        <nav id=\"mobile-dropdown-menu\" as-mobile-nav-drop-down=\"right\">\r\n            <div>\r\n                <ul>\r\n                    <li><a href=\"\" id=\"mobile-dropdown-user\">User</a></li>\r\n                    <li><a href=\"\" id=\"mobile-dropdown-account\">Account</a></li>\r\n                    <li><a href=\"\" id=\"mobile-dropdown-logout\">Logout</a></li>\r\n                </ul>\r\n                <div class=\"app-panel-popup\">\r\n                    <ul class=\"clearfix\">\r\n                        <li ng-repeat=\"app in appPanelConf.apps\" class=\"{{app.className}}\"><a href=\"{{app.linkTo}}\" target=\"_blank\"><span class=\"icon\"></span><span class=\"ass-mobile-nav-label\">{{app.label}}</span></a></li>\r\n                    </ul>\r\n                </div>\r\n            </div>\r\n        </nav>\r\n    </div>\r\n</nav>\r\n<div id=\"ass-mobile-nav\" class=\"collapse\">\r\n    <ul class=\"nav navbar-nav\">\r\n        <li class=\"col-xs-4\"></li>\r\n        <li class=\"col-xs-4\"><a as-nav-dropdown=\"navDropdownConf\" user-info=\"userInfo\" class=\"link-profile\"><span class=\"avatar\"><span ng-class=\"{\'online\': userInfo.online}\"></span></span><span class=\"ass-mobile-nav-label\">{{userInfo.fullname}}</span></a></li>\r\n        <li class=\"col-xs-4\"></li>\r\n    </ul>\r\n    <ul class=\"nav navbar-nav\">\r\n        <li ng-repeat=\"app in appPanelConf.apps\" class=\"col-xs-4 {{app.className}}\"><a href=\"{{app.linkTo}}\" target=\"_blank\"><span class=\"icon\"></span><span class=\"ass-mobile-nav-label\">{{app.label}}</span></a></li>\r\n    </ul>\r\n</div>");
$templateCache.put("partials/quick-access-bar.html","");
$templateCache.put("partials/selection-panel.html","");
$templateCache.put("elements/actual-predicted-energy/template.html","<div class=\"element\" id=\"actual-predicted-energy\" as-element-show-loading=\"{{ !isDataLoaded }}\">\r\n    <div class=\"header\">\r\n        <h5 class=\"title\" ng-click=\"detailElement()\">\r\n            <as-more-panel position=\"top left\" panel-title=\"Actual vs Predicted Energy\">\r\n                <div ng-include=\"\'app/partials/more-panels/actual-predicted-energy.html\'\"></div>\r\n            </as-more-panel>\r\n            Actual vs Predicted Energy\r\n        </h5>\r\n        <as-date-range-selector class=\"small\" ng-model=\"currentDimension\" ranges=\"month,year,total\"></as-date-range-selector>\r\n    </div>\r\n    <div class=\"widget\">\r\n        <!--a class=\"link-info\" ng-mouseover=\"toggleInfo($event, true)\" ng-mouseleave=\"toggleInfo($event, false)\">View Graph Info</a-->\r\n        <highchart id=\"chartActualPredictedEnergy\" config=\"columnChartConfig\"></highchart>\r\n    </div>\r\n</div>");
$templateCache.put("elements/annual-comparison/template.html","<div class=\"element\" id=\"annual-comparison\" as-element-show-loading=\"{{ !isDataLoaded }}\">\r\n	<div class=\"header\">\r\n		<h5 class=\"title\">\r\n			<as-more-panel position=\"top left\" panel-title=\"Annual Energy Generation Comparison\">\r\n				<div ng-include=\"\'app/partials/more-panels/annual-comparision.html\'\"></div>\r\n			</as-more-panel>\r\n			Annual Energy Generation Comparison\r\n		</h5>\r\n	</div>\r\n	<div class=\"widget\">\r\n		<highchart id=\"annualComboChart\" config=\"comboChartConfig\" class=\"widget chart-widget chart-container\"></highchart>\r\n	</div>\r\n</div>");
$templateCache.put("elements/avoided-carbon/template.html","<div class=\"element element-numeric avoided-widget\" as-element-show-loading=\"{{ !isDataLoaded }}\" id=\"avoided-carbon\">\r\n	<div class=\"header\">\r\n		<h5 class=\"title as-col-xl-hidden as-col-lg-hidden as-col-md-hidden as-col-sm-hidden\">\r\n			<as-more-panel position=\"top left\" panel-title=\"How Are Equivalencies Calculated?\" classes=\"more-carbon\">\r\n				<div ng-include=\"\'app/partials/more-panels/equivalencies.html\'\"></div>\r\n			</as-more-panel>\r\n			Avoided Carbon\r\n		</h5>\r\n		<h5 class=\"title as-col-xs-hidden\">\r\n			<as-more-panel position=\"top right\" panel-title=\"How Are Equivalencies Calculated?\" classes=\"more-carbon\">\r\n				<div ng-include=\"\'app/partials/more-panels/equivalencies.html\'\"></div>\r\n			</as-more-panel>\r\n			Avoided Carbon\r\n		</h5>\r\n		<as-date-range-selector ng-model=\"currentDimension\" ranges=\"month,year,total\" force-dropdown=\"true\"></as-date-range-selector>\r\n	</div>\r\n	<div class=\"content\">\r\n        <div class=\"avoided-value\" as-tooltip tooltip-text=\"infoPanelText\" tooltip-position=\"left middle\" tooltip-classes=\"kpi-tooltip\">\r\n            <b><as-animated-number ng-bind=\"lastCarbonAvoided.carbonAvoided\" compress=\"true\"></as-animated-number><sup>lbs</sup></b>\r\n        </div>\r\n        <div class=\"avoided-total\">Total: <as-animated-number ng-bind=\"lastCarbonAvoided.carbonAvoidedTotal\"></as-animated-number> lbs</div>\r\n    </div>\r\n</div>");
$templateCache.put("elements/realtime-power/drilldown.html","<div id=\"currentpower-modal\" class=\"opened-sp\">\r\n	<div class=\"clearfix\">\r\n		<div class=\"col-md-12 no-padding\">\r\n			<div class=\"element current-power\">\r\n				<div class=\"loading-animation\" ng-hide=\"isDataLoaded\"></div>\r\n				<div class=\"header\">\r\n					<h5 class=\"title\">\r\n						<a class=\"link-more\">\r\n							<i class=\"icon icon-ui-info\"></i>\r\n						</a>\r\n						Current Power\r\n					</h5>\r\n					<a class=\"drilldown-close\" ng-click=\"closeDrilldown()\"></a>\r\n				</div>\r\n				<div class=\"widget\">\r\n					<div id=\"energy-drilldown-combochart\" class=\"chart-container\">\r\n						<!--<highchart id=\"energy-drilldown-combochart\" config=\"chartConfig\" style=\"width:98%\"></highchart>-->\r\n					</div>\r\n				</div>\r\n				<div class=\"footer\">\r\n					<div class=\"kpis\">\r\n						<div class=\"kpi\">\r\n							<div class=\"kpi-title\">Total Production</div>\r\n							<div class=\"kpi-value\">\r\n								{{kpiData.totalEnergy | number:1 }}\r\n								<span class=\"unit\">kWh</span>\r\n							</div>\r\n						</div>\r\n						<div ng-repeat=\"energySource in kpiData.energyBySources\">\r\n							<div class=\"kpi\">\r\n								<div class=\"kpi-title\">{{energySource.name}}</div>\r\n								<div class=\"kpi-value\">\r\n									{{energySource.kwh | number:1 }}\r\n									<span class=\"unit\">kWh</span>\r\n								</div>\r\n							</div>\r\n						</div>\r\n					</div>\r\n				</div>\r\n			</div>\r\n		</div>\r\n	</div>\r\n</div>");
$templateCache.put("elements/realtime-power/template.html","<div class=\"element realtime-power\" id=\"realtime-power\" as-element-show-loading=\"{{ !isDataLoaded }}\">\r\n	<div class=\"header\">\r\n		<h5 class=\"title\">\r\n			<as-more-panel position=\"bottom left\" panel-title=\"Real-Time Power\">\r\n				<div ng-include=\"\'app/partials/more-panels/real-time-power.html\'\"></div>\r\n			</as-more-panel>\r\n			Real-Time Max Power\r\n		</h5>\r\n		<as-date-range-selector ng-model=\"dateRange\" ranges=\"today,week,month\"></as-date-range-selector>\r\n	</div>\r\n	<div class=\"widget\">\r\n		<div class=\"chart-container\">\r\n			<div class=\"nodata-chart\" ng-show=\"noDataRTP == true\">No data to display</div>\r\n			<highchart id=\"realtime-power-linechart\" config=\"primaryChart\" style=\"width:100%\" ng-show=\"noDataRTP == false\"></highchart>\r\n		</div>\r\n	</div>\r\n	<div class=\"footer\">\r\n		<div class=\"kpis\">\r\n			<div class=\"kpi\" ng-show=\"lastRTPower.kpiData.totalPowerGeneration > 0\">\r\n				<div class=\"kpi-title\">Total Production</div>\r\n\r\n				<div class=\"kpi-value\">\r\n					<as-animated-number ng-bind=\"lastRTPower.kpiData.totalPowerGeneration\" data-num-decimals=\"1\"></as-animated-number>\r\n					<span class=\"unit\">kW</span>\r\n					<sup class=\"animated as-sink\" ng-show=\"lastRTPower.kpiData.totalPowerGenerationTrend == \'down\'\">↓</sup>\r\n					<sup class=\"animated as-float\" ng-show=\"lastRTPower.kpiData.totalPowerGenerationTrend == \'up\'\">↑</sup>\r\n				</div>\r\n			</div>\r\n			<div ng-repeat=\"generation in lastRTPower.kpiData.generationBySources | limitTo: 3\">\r\n				<div class=\"kpi\">\r\n					<div class=\"kpi-title\">{{generation.name}}</div>\r\n					<div class=\"kpi-value\">\r\n						<as-animated-number ng-bind=\"generation.kw\" data-num-decimals=\"1\"></as-animated-number>\r\n						<span class=\"unit\">kW</span>\r\n						<sup class=\"animated  as-sink\" ng-show=\"generation.trend == \'down\'\">↓</sup>\r\n						<sup class=\"animated  as-float\" ng-show=\"generation.trend == \'up\'\">↑</sup>\r\n					</div>\r\n				</div>\r\n			</div>\r\n		</div>\r\n	</div>\r\n</div>");
$templateCache.put("elements/equivalencies/drilldown.html","<div id=\"equivalencies-drilldown\">\r\n    <!-- element solar-energy-generation -->\r\n    <div class=\"element\" as-element-show-loading=\"{{ !isDataLoaded }}\">\r\n        <div class=\"header\">\r\n            <h5 class=\"title drilldown\">\r\n                <a class=\"link-more\">\r\n                    <i class=\"icon icon-ui-info\"></i>\r\n                </a>\r\n                Equivalencies\r\n            </h5>\r\n            <a class=\"drilldown-close\" ng-click=\"closeDrilldown()\"></a>\r\n        </div>\r\n        <div class=\"equiv-widget-detail\">\r\n            <div class=\"detail-info row\">\r\n                <div class=\"col-md-6\">\r\n                    <ul>\r\n                        <li>\r\n                            <i class=\"icon icon-cars\"></i>\r\n                            <span class=\"equiv-name\">Cars Removed</span>\r\n                            <span class=\"multiply-icon\">x</span>\r\n                            <b class=\"equiv-value\" as-animated-number ng-bind=\"lastEquiv.carsRemoved|number:2\" data-num-decimals=\"2\"></b>\r\n                        </li>\r\n                        <li>\r\n                            <i class=\"icon icon-homes\"></i>\r\n                            <span class=\"equiv-name\">Homes Powered</span>\r\n                            <span class=\"multiply-icon\">x</span>\r\n                            <b class=\"equiv-value\" as-animated-number ng-bind=\"lastEquiv.homePowered|number:2\" data-num-decimals=\"2\"></b>\r\n                        </li>\r\n                        <li>\r\n                            <i class=\"icon icon-seedlings\"></i>\r\n                            <span class=\"equiv-name\">Seedlings Grown</span>\r\n                            <span class=\"multiply-icon\">x</span>\r\n                            <b class=\"equiv-value\" as-animated-number ng-bind=\"lastEquiv.seedlingsGrown|number:2\" data-num-decimals=\"2\"></b>\r\n                        </li>\r\n                        <li>\r\n                            <i class=\"icon icon-refrigirator\"></i>\r\n                            <span class=\"equiv-name\">Refrigerators</span>\r\n                            <span class=\"multiply-icon\">x</span>\r\n                            <b class=\"equiv-value\" as-animated-number ng-bind=\"lastEquiv.refrigerators|number:2\" data-num-decimals=\"2\"></b>\r\n                        </li>\r\n                        <li>\r\n                            <i class=\"icon icon-mobile\"></i>\r\n                            <span class=\"equiv-name\">Mobile Phones</span>\r\n                            <span class=\"multiply-icon\">x</span>\r\n                            <b class=\"equiv-value\" as-animated-number ng-bind=\"lastEquiv.mobilePhones|number:2\" data-num-decimals=\"2\"></b>\r\n                        </li>\r\n                        <li>\r\n                            <i class=\"icon icon-aa-battery\"></i>\r\n                            <span class=\"equiv-name\">AA Batteries</span>\r\n                            <span class=\"multiply-icon\">x</span>\r\n                            <b class=\"equiv-value\" as-animated-number ng-bind=\"lastEquiv.batteries|number:2\" data-num-decimals=\"2\"></b>\r\n                        </li>\r\n                        <li>\r\n                            <i class=\"icon icon-co2\"></i>\r\n                            <span class=\"equiv-name\">Avoided Carbon</span>\r\n                            <span class=\"multiply-icon\">x</span>\r\n                            <b class=\"equiv-value\"><as-animated-number ng-bind=\"lastEquiv.avoidedCarbon|number:2\" data-num-decimals=\"2\"></as-animated-number><sup>kg</sup></b>\r\n                        </li>\r\n                    </ul>\r\n                </div>\r\n                <div class=\"col-md-6\">\r\n                    <ul>\r\n                        <li>\r\n                            <i class=\"icon icon-gas\"></i>\r\n                            <span class=\"equiv-name\">Gallons of Gas</span>\r\n                            <span class=\"multiply-icon\">x</span>\r\n                            <b class=\"equiv-value\" as-animated-number ng-bind=\"lastEquiv.gallonsGas|number:2\" data-num-decimals=\"2\"></b>\r\n                        </li>\r\n                        <li>\r\n                            <i class=\"icon icon-gas-gallons\"></i>\r\n                            <span class=\"equiv-name\">Tankers of Gas</span>\r\n                            <span class=\"multiply-icon\">x</span>\r\n                            <b class=\"equiv-value\" as-animated-number ng-bind=\"lastEquiv.tankersGas|number:2\" data-num-decimals=\"2\"></b>\r\n                        </li>\r\n                        <li>\r\n                            <i class=\"icon icon-railroad-car\"></i>\r\n                            <span class=\"equiv-name\">Railroad Cars of Coal</span>\r\n                            <span class=\"multiply-icon\">x</span>\r\n                            <b class=\"equiv-value\" as-animated-number ng-bind=\"lastEquiv.railroadCarsCoal|number:2\" data-num-decimals=\"2\"></b>\r\n                        </li>\r\n                        <li>\r\n                            <i class=\"icon icon-oil-barrel\"></i>\r\n                            <span class=\"equiv-name\">Barrels Oil</span>\r\n                            <span class=\"multiply-icon\">x</span>\r\n                            <b class=\"equiv-value\" as-animated-number ng-bind=\"lastEquiv.barrelsOil|number:2\" data-num-decimals=\"2\"></b>\r\n                        </li>\r\n                        <li>\r\n                            <i class=\"icon icon-propane\"></i>\r\n                            <span class=\"equiv-name\">Propane Cylinders</span>\r\n                            <span class=\"multiply-icon\">x</span>\r\n                            <b class=\"equiv-value\" as-animated-number ng-bind=\"lastEquiv.propaneCylinders|number:2\" data-num-decimals=\"2\"></b>\r\n                        </li>\r\n                        <li>\r\n                            <i class=\"icon icon-power-plant\"></i>\r\n                            <span class=\"equiv-name\">Power Plants</span>\r\n                            <span class=\"multiply-icon\">x</span>\r\n                            <b class=\"equiv-value\" as-animated-number ng-bind=\"lastEquiv.powerPlants|number:2\" data-num-decimals=\"2\"></b>\r\n                        </li>\r\n                    </ul>\r\n                </div>\r\n            </div>\r\n            <div class=\"description row\">\r\n                <div class=\"col-md-12 title\"><b>How Are Equivalencies Calculated?</b></div>\r\n                <div class=\"col-md-6\">\r\n                    <p>Energy is produced, consumed, or stored. So, comparing the watt-hours of energy stored by a battery to the kilowatt-hours produced by your solar array is relatively easy. But, what about the energy stored in a gallon of gas or a barrel of oil? And, how is there any correlation between a kilowatt-hour and a seedling?</p>\r\n                    <p>The Emissions & Generation Resource Integrated Database (eGRID) publishes an emissions rate for carbon dioxide (CO2). This rate represents how much CO2 is produced in the U.S. annually through the generation of electric power. </p>\r\n                </div>\r\n                <div class=\"col-md-6\">\r\n                    <p>Generally speaking, a kWh from the United States power grid produces 15.2 pounds of CO2. This is known as the “Emissions Factor.“</p>\r\n                    <p>Like utility power plants, fuels such as gas, oil, and propane produce CO2 when they are converted to energy. Likewise, plants absorb CO2. So, we can use the Emissions Factor to compare the energy produced by your solar array to the CO2 something produces or consumes. </p>\r\n                    <p>To learn more, visit eGrid or do you own calculations using the EPA’s Greenhouse Gas Equivalencies Calculator. </p>\r\n                </div>\r\n            </div>\r\n        </div>\r\n    </div>\r\n</div>");
$templateCache.put("elements/equivalencies/template.html","<div class=\"element equiv-widget\" id=\"equivalencies\" as-element-show-loading=\"{{ !isDataLoaded }}\">\r\n    <div class=\"header\">\r\n        <h5 class=\"title\">\r\n            <as-more-panel position=\"bottom left\" panel-title=\"How Are Equivalencies Calculated?\">\r\n                <div ng-include=\"\'app/partials/more-panels/equivalencies.html\'\"></div>\r\n            </as-more-panel>\r\n            Equivalencies\r\n        </h5>\r\n        <as-date-range-selector ng-model=\"dateRange\" ranges=\"month,year,total\" class=\"small\"></as-date-range-selector>\r\n    </div>\r\n    <div class=\"content\">\r\n        <div class=\"element-block first\" as-tooltip tooltip-content-dom=\"#infoEquivCar\" tooltip-position=\"bottom center\" tooltip-classes=\"kpi-tooltip\">\r\n            <div class=\"equiv-value\">\r\n                <b><as-animated-number ng-bind=\"lastEquiv.carsRemoved\" compress=\"true\" data-num-decimals=\"2\"></as-animated-number></b>\r\n                <span ng-show=\"carMillions\">Millions</span>\r\n            </div>\r\n            <div class=\"icon-area\">\r\n                <span class=\"multiply-icon\">x</span>\r\n                <i class=\"icon icon-cars\"></i>\r\n            </div>\r\n            <span class=\"element-title\">Cars Removed</span>\r\n        </div>\r\n        <div class=\"element-block\" as-tooltip tooltip-content-dom=\"#infoEquivHome\" tooltip-position=\"bottom center\" tooltip-classes=\"kpi-tooltip\">\r\n            <div class=\"equiv-value\">\r\n                <b><as-animated-number ng-bind=\"lastEquiv.homePowered\" compress=\"true\" data-num-decimals=\"2\"></as-animated-number></b>\r\n                <span ng-show=\"homeMillions\">Millions</span>\r\n            </div>\r\n            <div class=\"icon-area\">\r\n                <span class=\"multiply-icon\">x</span>\r\n                <i class=\"icon icon-homes\"></i>\r\n            </div>\r\n            <span class=\"element-title\">Homes Powered</span>\r\n        </div>\r\n        <div class=\"element-block last\" as-tooltip tooltip-content-dom=\"#infoEquivSeedling\" tooltip-position=\"right middle\" tooltip-classes=\"kpi-tooltip\">\r\n            <div class=\"equiv-value\">\r\n                <b><as-animated-number ng-bind=\"lastEquiv.seedlingsGrown\" compress=\"true\"></as-animated-number></b>\r\n                <span ng-show=\"seedlingMillions\">Millions</span>\r\n            </div>\r\n            <div class=\"icon-area\">\r\n                <span class=\"multiply-icon\">x</span>\r\n                <i class=\"icon icon-seedlings\"></i>\r\n            </div>\r\n            <span class=\"element-title\">Seedlings Grown</span>\r\n        </div>\r\n        <div class=\"clearfix\"></div>\r\n        <div class=\"info-panel\" id=\"infoEquivCar\">\r\n            <p>The average car gets 21.4 miles per gallon of gas, and travels over 11,000 miles year.</p>\r\n            <p>One gallon of gas is equivalent to <span class=\"orange\">13kWh</span>. So, the <span class=\"orange\" ng-bind=\"lastEquiv.kwh + \'kWh\'\">0kWh</span> generated by your solar array<span ng-bind=\"dateRangeLabels | lowercase\"></span> is the equivalent of taking <span class=\"orange\" ng-bind=\"lastEquiv.carsRemoved | number : 2\"></span> car(s) off of the road for a full year. </p>\r\n        </div>\r\n        <div class=\"info-panel\" id=\"infoEquivHome\">\r\n            <p>The average home consumes over 12,000 kWh every year.</p>\r\n            <p>So, the <span class=\"orange\" ng-bind=\"lastEquiv.kwh + \'kWh\'\">0kWh</span> generated by your solar array{{dateRangeLabels | lowercase}} is the equivalent of powering <span class=\"orange\" ng-bind=\"lastEquiv.homePowered|number:2\"></span> homes for a full year.</p>\r\n        </div>\r\n        <div class=\"info-panel\" id=\"infoEquivSeedling\">\r\n            <p>A coniferous tree sequesters 23.2lbs of carbon over ten years, which is equivalent to about <span class=\"orange\">0.02kWh</span>.</p>\r\n            <p>So, the <span class=\"orange\" ng-bind=\"lastEquiv.kwh + \'kWh\'\">0kWh</span> generated by your solar array{{dateRangeLabels | lowercase}} is the equivalent of growing <span class=\"orange\" ng-bind=\"lastEquiv.seedlingsGrown|number:2\"></span> trees.</p>\r\n        </div>\r\n    </div>\r\n</div>");
$templateCache.put("elements/savings/drilldown.html","<div id=\"savings-drilldown\" >\r\n	<div class=\"clearfix\">\r\n		<div class=\"col-sm-12 no-padding\">\r\n			<!-- Elelement solar-energy-generation -->\r\n			<div class=\"element corner\" as-element-show-loading=\"{{ !isDataLoaded.comboChart }}\">\r\n				<div class=\"loading-animation\" ng-hide=\"isDataLoaded\"></div>\r\n				<div class=\"header\">\r\n					<h5 class=\"title drilldown\">\r\n						<a class=\"link-more\">\r\n							<i class=\"icon icon-ui-info\"></i>\r\n						</a>\r\n						Savings\r\n					</h5>\r\n					<a class=\"drilldown-close\" ng-click=\"closeDrilldown()\"></a>\r\n				</div>\r\n				<div class=\"widget\" style=\"width: 100%; min-height: 330px;\">\r\n					<highchart id=\"savingsComboChart\" config=\"comboChart\" class=\"widget chart-widget\"></highchart>\r\n				</div>\r\n				<div class=\"footer\">\r\n					<div class=\"kpis\">\r\n						<div class=\"kpi\">\r\n							<div class=\"kpi-title\">Total Savings</div>\r\n							<div class=\"kpi-value\">${{kpiData.totalSavings}}</div>\r\n						</div>\r\n						<div class=\"kpi\">\r\n							<div class=\"kpi-title\">Total Production</div>\r\n							<div class=\"kpi-value\">{{kpiData.totalProduction | number:0 }}<span class=\"unit\">kWh</span></div>\r\n						</div>\r\n						<div class=\"kpi\" ng-repeat=\"production in kpiData.totalProductionBySources\">\r\n							<div class=\"kpi-title\">{{production.displayName}}</div>\r\n							<div class=\"kpi-value\">{{production.kwh | number:0 }}<span class=\"unit\">kWh</span></div>\r\n						</div>\r\n					</div>\r\n				</div>\r\n			</div>\r\n			<!-- End solar-energy-generation -->\r\n		</div>\r\n		<div class=\"col-sm-6 no-padding\">\r\n			<!-- Elelement generation-per-sources -->\r\n            <div class=\"element\" as-element-show-loading=\"{{ !isDataLoaded.areaChart }}\">\r\n            	<div class=\"loading-animation\" ng-hide=\"isDataLoaded\"></div>\r\n				<div class=\"header\">\r\n					<h5 class=\"title\">\r\n						<a class=\"link-more\">\r\n							<i class=\"icon icon-ui-info\"></i>\r\n						</a>\r\n						Savings Per Facility\r\n					</h5>\r\n				</div>\r\n				<div class=\"widget\" style=\"width: 100%; height: 494px;padding-top: 10px;\">\r\n					<highchart id=\"timelineChart\" config=\"areaChart\">\r\n				</div>\r\n			</div>\r\n			<!-- End generation-per-sources -->\r\n        </div>\r\n        <div class=\"col-sm-6 no-padding\">\r\n            <!-- Elelement generation-per-month -->\r\n            <div class=\"element\" as-element-show-loading=\"{{ !isDataLoaded.table }}\">\r\n				<div class=\"header\">\r\n					<h5 class=\"title\">\r\n						<a class=\"link-more\">\r\n							<i class=\"icon icon-ui-info\"></i>\r\n						</a>\r\n						Savings Per Month\r\n					</h5>\r\n				</div>\r\n				<div as-sp-list-scroll-bar class=\"row widget table-widget\" scroll-wrapper-height=\"494px\">\r\n				<!--\r\n					<div class=\"date-range\">\r\n			            <label for=\"date_from\">From:</label>\r\n			            <input type=\"text\" ng-model=\"tableChart.dateFrom\" id=\"date_from\">\r\n			            <label for=\"date_to\">To:</label>\r\n			            <input type=\"text\" ng-model=\"tableChart.dateTo\" id=\"date_to\">\r\n			        </div>\r\n			    -->\r\n					<table class=\"table ng-table-responsive\">\r\n                        <tr class=\"\">\r\n                        	<th colspan=\"2\"></th>\r\n                            <th ng-repeat=\"column in tableChart.columns\"><span>{{column}}</span></th>\r\n                        </tr>\r\n                        <tr ng-repeat=\"row in tableChart.data\">\r\n                        	<td colspan=\"2\"><span class=\"diff-percent\">{{row.percent}}%</span><span class=\"dimensions\">{{row.date | amDateFormat:\'MMMM, YYYY\'}}</span></td>\r\n                        	<td ng-repeat=\"sourceName in tableChart.sourceNames\" class=\"data\">\r\n                            	<span class=\"bold\"><span>$</span>{{(row.sources[sourceName].savings||0) | number:2 }}</span>\r\n                            	<span class=\"thin\">{{(row.sources[sourceName].kwh||0) | number:0 }} <span>kWh</span></span>\r\n                            </td>\r\n                        </tr>\r\n                    </table>\r\n				</div>\r\n			</div>\r\n			<!-- End generation-per-month -->\r\n        </div>\r\n	</div>\r\n</div>");
$templateCache.put("elements/savings/template.html","<div class=\"element element-numeric\" id=\"savings\" as-element-show-loading=\"{{ !isDataLoaded }}\">\r\n	<div class=\"header\">\r\n		<h5 class=\"title\">\r\n			<as-more-panel position=\"bottom left\" panel-title=\"Savings\">\r\n				<div id=\"wrapperSavingMorePanel\" ng-include=\"\'app/partials/more-panels/savings.html\'\"></div>\r\n			</as-more-panel>\r\n			Savings\r\n		</h5>\r\n		<as-date-range-selector ng-model=\"dateRange\" ranges=\"today,month,YTD,total\" force-dropdown=\"true\"></as-date-range-selector>\r\n	</div>\r\n	<div class=\"widget\">\r\n		<div class=\"kpi\" as-tooltip tooltip-content-dom=\"#infoSavings\" tooltip-position=\"right middle\" tooltip-classes=\"kpi-tooltip\">\r\n			<sup class=\"kpi-title\">$</sup>\r\n            <span class=\"kpi-value link-info numeric-data\" ng-bind=\"lastSavingData.kpi.totalSavingPerDateRange\" direction=\"right\" as-animated-number>0</span>\r\n		</div>\r\n		<div class=\"total\">\r\n			<span class=\"total-title\">Total: </span>\r\n			<span class=\"total-value\"> $\r\n                <b ng-bind=\"lastSavingData.kpi.totalSavings\" as-animated-number data-num-decimals=\"2\">0.00</b>\r\n            </span>\r\n		</div>\r\n	</div>\r\n	<div id=\"infoSavings\" class=\"info-panel\">\r\n		<p class=\"bottom\">The estimated value of your solar generation is determined by multiplying your total energy generated (in kWh) over a given time period by an estimated utility rate of <span class=\"orange\">$0.10/kWh</span>. Your actual utility rate will vary.</p>\r\n	</div>\r\n</div>\r\n");
$templateCache.put("elements/solar-energy-generation/drilldown.html","<div id=\"solar-energy-generation-drilldown\">\r\n  <div class=\"clearfix\">\r\n    <div class=\"col-sm-12 no-padding\">\r\n      <!-- Elelement solar-energy-generation -->\r\n      <div class=\"element corner\">\r\n        <div class=\"loading-animation\" ng-hide=\"candlestickChart.loaded\"></div>\r\n        <div class=\"header\">\r\n          <h5 class=\"title drilldown\">\r\n            <a class=\"link-more\">\r\n              <i class=\"icon icon-ui-info\"></i>\r\n            </a>\r\n            Solar Energy Generation\r\n          </h5>\r\n          <a class=\"drilldown-close\" ng-click=\"closeDrilldown()\"></a>\r\n        </div>\r\n        <!--\r\n        <div class=\"date-range-nav row\">\r\n          <div class=\"col-xs-4 text-left\">\r\n            <a ng-click=\"prevDate()\" class=\"prev-nav\"><span class=\"hidden-xs\">{{prevDateLabel}}</span></a>\r\n          </div>\r\n          <div class=\"col-xs-4 text-center\">\r\n            <span class=\"cur-nav\">{{currentDateLabel}}</span>\r\n          </div>\r\n          <div class=\"col-xs-4 text-right\">\r\n            <a ng-click=\"nextDate()\" class=\"next-nav\"><span class=\"hidden-xs\">{{nextDateLabel}}</span></a>\r\n          </div>\r\n        </div>\r\n        -->\r\n        <div class=\"widget candlestick-widget\">\r\n          <div id=\"candlestickChart\"></div>\r\n        </div>\r\n        <div class=\"footer\">\r\n          <div class=\"kpis\">\r\n            <div class=\"kpi\">\r\n              <div class=\"kpi-title\">Total Savings</div>\r\n              <div class=\"kpi-value\">${{kpiData.totalSavings | number:2 }}</div>\r\n            </div>\r\n            <div class=\"kpi\">\r\n              <div class=\"kpi-title\">Total Production</div>\r\n              <div class=\"kpi-value\">{{kpiData.totalEnergyProduction | number:0 }}<span class=\"unit\">kWh</span></div>\r\n            </div>\r\n            <div class=\"kpi\" ng-repeat=\"itemFacility in kpiData.facilities | limitTo: 3\">\r\n              <div class=\"kpi-title\">{{itemFacility.name}}</div>\r\n              <div class=\"kpi-value\">{{itemFacility.value | number:0 }}<span class=\"unit\">kWh</span></div>\r\n            </div>\r\n          </div>\r\n        </div>\r\n      </div>\r\n      <!-- End solar-energy-generation -->\r\n    </div>\r\n    <div class=\"col-sm-4 no-padding\">\r\n      <!-- Elelement generation-per-sources -->\r\n      <div class=\"element\">\r\n        <div class=\"loading-animation\" ng-hide=\"pieChart.loaded\"></div>\r\n        <div class=\"header\">\r\n          <h5 class=\"title\">\r\n            <a class=\"link-more\">\r\n              <i class=\"icon icon-ui-info\"></i>\r\n            </a>\r\n            Generation Per Source\r\n          </h5>\r\n        </div>\r\n        <div class=\"widget\">\r\n          <highchart id=\"gpsPieChart\" config=\"gpsPieChartConfig\" class=\"widget pie-widget\"></highchart>\r\n        </div>\r\n      </div>\r\n      <!-- End generation-per-sources -->\r\n    </div>\r\n    <div class=\"col-sm-8 no-padding\">\r\n      <!-- Elelement generation-per-month -->\r\n      <div class=\"element table-element\">\r\n        <div class=\"loading-animation\" ng-hide=\"tableChart.loaded\"></div>\r\n        <div class=\"header\">\r\n          <h5 class=\"title\">\r\n            <a class=\"link-more\">\r\n              <i class=\"icon icon-ui-info\"></i>\r\n            </a>\r\n            Generation Per Month\r\n          </h5>\r\n        </div>\r\n        <div as-sp-list-scroll-bar class=\"row widget table-widget\" widget-table=\"generation-per-month\">\r\n          <!--\r\n          <div ng-hide=\"true\" class=\"date-range\">\r\n            <label for=\"date_from\">From:</label>\r\n            <input type=\"text\" ng-model=\"tableChart.dateFrom\" id=\"date_from\">\r\n            <label for=\"date_to\">To:</label>\r\n            <input type=\"text\" ng-model=\"tableChart.dateTo\" id=\"date_to\">\r\n          </div>\r\n          -->\r\n          <table class=\"table ng-table-responsive\" ng-table=\"tableChart.param\">\r\n            <tr class=\"\">\r\n              <th colspan=\"2\"></th>\r\n              <th ng-repeat=\"column in tableChart.columns | limitTo: 5\"><span>{{column.name}}</span></th>\r\n            </tr>\r\n            <tr ng-repeat=\"row in $data\">\r\n              <td colspan=\"2\"><span class=\"diff-percent\">{{row.percent | number:0 }}%</span><span class=\"dimensions\">{{row.dateKey}}</span></td>\r\n              <td ng-repeat=\"column in tableChart.columns | limitTo: 5\">\r\n                <span>{{(row.sources[column.name].kwh > 0) ? (row.sources[column.name].kwh | number:0) : 0 }}<span class=\"unit\">kWh</span></span>\r\n              </td>\r\n            </tr>\r\n          </table>\r\n        </div>\r\n      </div>\r\n      <!-- End generation-per-month -->\r\n        </div>\r\n  </div>\r\n</div>");
$templateCache.put("elements/solar-energy-generation/template.html","<div class=\"element\" id=\"solar-energy-generation\" as-element-show-loading=\"{{ !mainChart.loaded }}\">\r\n  <div class=\"header\">\r\n    <h5 class=\"title\" ng-click=\"detailElement()\">\r\n      <as-more-panel position=\"bottom left\" panel-title=\"Solar Energy Generation\" classes=\"more-seg\">\r\n        <div ng-include=\"\'app/partials/more-panels/solar-energy-generation.html\'\"></div>\r\n      </as-more-panel>\r\n      Solar Energy Generation\r\n    </h5>\r\n    <as-date-range-selector ng-model=\"currentDimension\" ranges=\"week,month,year,total\"></as-date-range-selector>\r\n  </div>\r\n  <div class=\"date-range-nav row\">\r\n    <div class=\"col-xs-4 text-left\">\r\n      <a ng-click=\"prevDate()\" class=\"prev-nav\"><span class=\"hidden-xs\">{{prevDateLabel}}</span></a>\r\n    </div>\r\n    <div class=\"col-xs-4 text-center\">\r\n      <span class=\"cur-nav\">{{currentDateLabel}}</span>\r\n    </div>\r\n    <div class=\"col-xs-4 text-right\">\r\n      <a ng-click=\"nextDate()\" class=\"next-nav\"><span class=\"hidden-xs\">{{nextDateLabel}}</span></a>\r\n    </div>\r\n  </div>\r\n  <div class=\"cursor-pointer\" ng-click=\"detailElement()\">\r\n    <highchart id=\"segMainChart\" config=\"segMainChartConfig\" class=\"widget chart-widget\"></highchart>\r\n  </div>\r\n  <div class=\"footer\">\r\n    <div class=\"kpis cursor-pointer\" ng-click=\"detailElement()\">\r\n      <div class=\"kpi\">\r\n        <div class=\"kpi-title\">Total Savings</div>\r\n        <div class=\"kpi-value\">${{kpiData.totalSavings | number:2 }}</div>\r\n      </div>\r\n      <div class=\"kpi\">\r\n        <div class=\"kpi-title\">Total Production</div>\r\n        <div class=\"kpi-value\">{{kpiData.totalEnergyProduction | number:0 }}<span class=\"unit\">kWh</span></div>\r\n      </div>\r\n      <div class=\"kpi\" ng-repeat=\"itemFacility in kpiData.facilities | limitTo: 3\">\r\n        <div class=\"kpi-title\">{{itemFacility.name}}</div>\r\n        <div class=\"kpi-value\">{{itemFacility.value | number:0 }}<span class=\"unit\">kWh</span></div>\r\n      </div>\r\n    </div>\r\n  </div>\r\n</div>");
$templateCache.put("elements/sunhours-energy/template.html","<div class=\"element sun-hours\" id=\"sunhours-energy\">\r\n	<div class=\"header row\">\r\n		<div class=\"title col-md-6\">\r\n			<a class=\"link-more ve\" more-dialog=\"#sunhours_more\"><i class=\"icon icon-ui-info\"></i></a>						\r\n			<a href=\"javascript:void(0)\" class=\"link-detail\">Energy by Sun-Hours</a>\r\n		</div>\r\n	</div>\r\n	<div class=\"widget\">\r\n		<div class=\"col-md-2\">\r\n			<div class=\"total-label\">Total in {{currentYear}}</div>\r\n			<div class=\"total-value\">{{totalHours | number}} Hours</div>\r\n			<div class=\"sh-year-label pull-left\" ng-click=\"goPrevYear()\">\r\n				<span class=\"icon-arrow left\"></span> <span>{{prevYear}}</span>\r\n			</div>\r\n			<div class=\"sh-year-label pull-right\" ng-click=\"goNextYear()\" ng-hide=\"currentYear == fullYear\">\r\n				 <span>{{nextYear}}</span><span class=\"icon-arrow right\"></span>\r\n			</div>\r\n			<div class=\"clearfix\"></div>\r\n		</div>\r\n		<div class=\"col-md-10\">\r\n			<div id=\"calendarChart\" class=\"calendar-chart\"></div>\r\n		</div>\r\n		<div class=\"clearfix\"></div>\r\n	</div>\r\n	<div style=\"width:100%; height:200px\">\r\n	</div>\r\n	<div class=\"more\" id=\"sunhours_more\">\r\n		<div class=\"blue-box\">\r\n			<h5 class-\"title\">What are \"Sun-Hours\"?</h5>\r\n			<div class=\"row\">\r\n				<div class=\"col-md-12\">\r\n					<p>Energy is the amount  of power that is  used over  a specific time. Irradiance is the amount  of solar radiation  that is delivered to an area over a certain amount of  time. That means that for any given area, there is a specific amount of radiant power delivered to that area by the sun.</p> \r\n					<p>The amount of time that Irradiance is delivered and collected determines how much energy your solar array can harvest. This is known as “Insolation” and is calculated by taking the power multiplied by time and divided by area. </p>\r\n					<p>Insolation is used to determine an array’s “Sun Hours.” For each geographical location, and depending on the time of year, there is a certain amount of Sun Hours per day that have historically been measured at that location. Sun Hours should not be confused with the amount of hours the sun is out since the sun does not remain in the same location during the day and does not follow the same path depending on the time of year. </p>\r\n					<p>For example, the month of July in Kansas City has an average of 6.56 Sun Hours per day. Even though the sun is out for longer than 6.56 hours each day, that value is as if the sun were shining at its maximum potential. In contrast, the same location in the month of December has an average of only 1.89 Sun Hours. </p>\r\n					<p>Other factors when determining energy generated are the solar array system size, the orientation of the solar array and the tilt angle of the solar modules.</p>\r\n				</div>\r\n			</div>\r\n			<div class=\"arrow-top\"></div>\r\n		</div>\r\n	</div>\r\n</div>");
$templateCache.put("elements/total-energy-generation/template.html","<div class=\"element element-numeric total-energy-generation\" as-element-show-loading=\"{{ !isDataLoaded }}\">\r\n	<div class=\"header\">\r\n		<h5 class=\"title\">\r\n			<as-more-panel position=\"bottom left\" panel-title=\"Total Energy Generation\">\r\n				<div ng-include=\"\'app/partials/more-panels/total-energy-generation.html\'\"></div>\r\n			</as-more-panel>\r\n			Total Energy Generation\r\n		</h5>\r\n		<as-date-range-selector ng-model=\"dateRange\" ranges=\"week,month,year,total\" force-dropdown=\"true\"></as-date-range-selector>\r\n	</div>\r\n	<div class=\"widget\">\r\n		<div class=\"total-generation\">\r\n			<a class=\"link-info\">Total Generation</a>\r\n            <div as-tooltip tooltip-text=\"infoPanelText\" tooltip-position=\"left middle\" tooltip-classes=\"kpi-tooltip\" class=\"numeric-data-wrapper\">\r\n            	<span ng-bind=\"lastTEG.value\" as-animated-number compress=\"true\" nosuffix=\"true\" class=\"numeric-data\">0</span>\r\n				<sup ng-bind=\"lastTEG.unit\">kwh</sup>\r\n            </div>\r\n        </div>\r\n	</div>\r\n</div>");
$templateCache.put("elements/weather-history/template.html","<div class=\"wrapper-weather-history\">\r\n    <div class=\"header\" ng-transclude>\r\n    </div>\r\n    <div class=\"content\">\r\n        <div class=\"weather-history-control\">\r\n            <ul class=\"list-selection-panel list-weather-history\">\r\n                <li ng-repeat=\"ws in weatherHistory\">\r\n                    <div class=\"inner\">\r\n                    {{ ws.date | amDateFormat: \'MMM D, YYYY\'}}\r\n                    <ul class=\"list-inline pull-right\">\r\n                        <li class=\"temperature\">\r\n                            {{ ws.highTemperature }}° / {{ ws.lowTemperature }}°\r\n                            <as-info-panel placement=\"bottom left\" theme=\"dark\">\r\n                                <h5 class=\"title\">\r\n                                    {{ ws.city }} <br/>\r\n                                    {{ ws.date | amDateFormat: \'ddd, MMM D\'}}\r\n                                </h5>\r\n                                <p class=\"no-margin\">\r\n                                    High:&nbsp;\r\n                                    <span class=\"kpi-info\">{{ws.highTemperature}}°</span>\r\n                                </p>\r\n                                <p class=\"no-margin\">\r\n                                    Low:&nbsp;\r\n                                    <span class=\"kpi-info\">{{ws.lowTemperature}}°</span>\r\n                                </p>\r\n                                <p class=\"no-margin\">\r\n                                    Daylight:&nbsp;\r\n                                    <span class=\"kpi-info\">\r\n                                        {{ws.sunriseTime | amDateFormat: \'h:mm a\'}} ~ {{ws.sunsetTime | amDateFormat: \'h:mm a\'}}\r\n                                    </span>\r\n                                </p>\r\n                                <p class=\"no-margin\">\r\n                                    Humidity:&nbsp;\r\n                                    <span class=\"kpi-info\">{{ws.humidity}}%</span>\r\n                                </p>\r\n                                <p class=\"no-margin\">\r\n                                    Pressure:&nbsp;\r\n                                    <span class=\"kpi-info\">{{ws.pressure}} hPa</span>\r\n                                </p>\r\n                                <p>\r\n                                    Wind:&nbsp;\r\n                                    <span class=\"kpi-info\">{{ws.windSpeed}} mph W</span>\r\n                                </p>\r\n                            </as-info-panel>\r\n                        </li>\r\n                        <li class=\"weather-icon\">\r\n                            <i class=\"icon icon-weather-{{ ws.status }}\"></i>\r\n                        </li>\r\n                    </ul>\r\n                    </div>\r\n                </li>\r\n            </ul>\r\n            <div class=\"offset\" ng-show=\"availableLoadMore\">\r\n                <p><img src=\"assets/img/ajax-loader-sp.gif\" width=\"20px\" height=\"20px\" align=\"middle\"/>&nbsp; Loading.... </p>\r\n            </div>\r\n        </div>\r\n    </div>\r\n</div>\r\n");
$templateCache.put("partials/more-panels/actual-predicted-energy.html","<p>It\'s important to be able to see your system\'s production and know why it\'s over/under producing. Much like the weather, it\'s hard to predict, but we do have a good idea of what to expect. Using weather patterns and data from the US Department of Energy (via NREL) we have exprected energy yields.</p>\r\n<p>There are many factors that can play into why your system is producing more, or less than exprected. We try to be conservative when estimating what a system will produce. Systems tend to under produce expected yields in the winter and over production in the summer. During the winter we have shorter days(less sun) and snow cover. The opposite is true during the summer time. We have longer days and no snow. Although rain and cloudy days affect solar production, they are accounted for using the historical data.</p>");
$templateCache.put("partials/more-panels/annual-comparision.html","<p>When comparing your system\'s current production to previous years you will always see variance. No two days are the same when it comes to the weather and most often what is highlighted are differences in the it. Variances in weather year to year can have a profound effect on levels of production. If last February was brutally cold and you experienced heavy snows, chances are that solar production was low. If this year\'s winter has been milder you\'ll most likely see a significant bump in production when comparing month over month (Feb vs Feb).</p>\r\n<p>It\'s important to remember that when comparing one month or year to the next that although there may be short term peaks and valleys, the longer the system is on, the closer to the expected production it it gets. The predicted yields may not look accurate on a day to week basis, but when you compare months and years it begins to be much more predictable.</p>");
$templateCache.put("partials/more-panels/current-weather.html","<p>\r\n    Current Weather shows the current weather of first selected facility\r\n</p>");
$templateCache.put("partials/more-panels/equivalencies.html","<p>Energy is produced, consumed, or stored. So, comparing the watt-hours of energy stored by a battery to the kilowatt-hours produced by your solar array is relatively easy. But, what about the energy stored in a gallon of gas or a barrel of oil? And, how is there any correlation between a kilowatt-hour and a seedling?</p>\r\n<p>The Emissions & Generation Resource Integrated Database (eGRID) publishes an emissions rate for carbon dioxide (CO2). This rate represents how much CO2 is produced in the U.S. annually through the generation of electric power. </p>\r\n<p>Generally speaking, a kWh from the United States power grid produces 15.2 pounds of CO2. This is known as the “Emissions Factor.“</p>\r\n<p>Like utility power plants, fuels such as gas, oil, and propane produce CO2 when they are converted to energy. Likewise, plants absorb CO2. So, we can use the Emissions Factor to compare the energy produced by your solar array to the CO2 something produces or consumes. </p>");
$templateCache.put("partials/more-panels/facility-detail.html","<p>The Power Plant Details provide site specific information regarding your system. </p>\r\n<p>The Commissioning Date is the date the system was first turned on, or energized.</p>\r\n<p>The Potential Power is the total capacity, in kW, of the physical system and is dependent on system design. This number is found by combining the rated sizes of the inverters in your system. The inverters convert the DC power generated by the solar modules into AC power that your facility can use. </p>\r\n<p>The Total Energy Generated is the true total generation (kWh) reported by the system since Commissioning Date. This total is a lump sum of all generated energy that has passed through the system\'s inverters, regardless of whether or not a daily/hourly total was recorded. </p>");
$templateCache.put("partials/more-panels/power-plant-details.html","<p>The Power Plant Details provide site specific information regarding your system.</p>\r\n<p>The Commissioning Date is the date the system was first turned on, or energized.</p>\r\n<p>The Potential Power is the total capacity, in kW, of the physical system and is dependent on system design. This number is found by combining the rated sizes of the inverters in your system. The inverters convert the DC power generated by the solar modules into AC power that your facility can use.</p>\r\n<p>The Total Energy Generated is the true total generation (kWh) reported by the system since Commissioning Date. This total is a lump sum of all generated energy that has passed through the system\'s inverters, regardless of whether or not a daily/hourly total was recorded.</p>");
$templateCache.put("partials/more-panels/power-vs-energy.html","<p>\r\n    If electricity were water, then power is gallons per minute, which goes to zero when you turn off the tap. Energy is total gallons consumed.\r\n</p>\r\n<div class=\"row\" style=\"margin: 0 0 15px;\">\r\n    <div class=\"col-md-6 no-padding\">\r\n        <div class=\"wrapper-kpi light right-meter\">\r\n            <as-meter-bar min=\"powerInfo.minAvg\" max=\"powerInfo.maxAvg\" ng-model=\"powerInfo.current\"></as-meter-bar>\r\n            <div class=\"numeric-content\">\r\n                <span class=\"kpi-value\"><b ng-bind=\"powerInfo.current\">0</b><sup>kW</sup></span>\r\n                <span class=\"kpi-title\">Current Power</span>\r\n            </div>\r\n        </div>\r\n    </div>\r\n    <div class=\"col-md-6\"><p>Power - measured in Watts (W) or Kilowatts (kW) - is like your speedometer. Your speedometer shows your current speed</p></div>\r\n</div>\r\n<div class=\"row\" style=\"margin: 0 0 15px;\">\r\n    <div class=\"col-md-6 no-padding\">\r\n        <div class=\"wrapper-kpi light right-meter\">\r\n            <as-meter-bar min=\"energyInfo.minAvg\" max=\"energyInfo.maxAvg\" ng-model=\"energyInfo.today\"></as-meter-bar>\r\n            <div class=\"numeric-content\">\r\n                <span class=\"kpi-value\"><b ng-bind=\"energyInfo.today\">0</b><sup>kWh</sup></span>\r\n                <span class=\"kpi-title\">Today\'s Energy</span>\r\n            </div>\r\n        </div>\r\n    </div>\r\n    <div class=\"col-md-6\"><p>Energy - measured in Watt-Hours (Wh) or Kilowatt-Hours (kWh) - is like your odometer. Your odometer shows how far that speed took you over time</p></div>\r\n</div>\r\n<p>\r\n    Your current power is <span class=\"kpi-info\">{{ powerInfo.current }}kW</span>.\r\n    It’s <as-current-time format=\"h:mma\"></as-current-time> on a {{ todayWeather.summary | lowercase }} day and your system’s peak production capability is <span class=\"kpi-info\" ng-bind=\"powerInfo.potential + \'kW\'\">0kW</span>.\r\n    If it weren’t for the clouds, you would be producing more power.\r\n    You can see this by comparing your energy today, {{ energyInfo.today }}kWh, with the most recent sunny day, <span class=\"kpi-info\">{{ lastSunnyDay.day | amDateFormat:\'MMMM Do\':\'utc\' }}</span>, when your system produced <span class=\"kpi-info\">{{ lastSunnyDay.energy + \'kWh\' }}</span>.\r\n    <!--You can see this by comparing your energy today <span class=\"kpi-info\">{{ energyInfo.today }}kWh</span>, with the most recent sunny day, <span ng-bind=\"energyInfo.lastSunnyDay.day | amDateFormat:\'MMMM do\'\"><i>loading...</i></span>, when your system produced <span class=\"kpi-info\" ng-bind=\"energyInfo.lastSunnyDay.energy + \'kWh\'\">0kWh</span>.-->\r\n</p>\r\n");
$templateCache.put("partials/more-panels/real-time-power.html","<p>Real Time Power is the rate that electricity is generated at a given time by a solar power plant. This amount depends on the maximum power capacity available relative to the sunlight\'s intensity at that given time.</p>");
$templateCache.put("partials/more-panels/savings.html","<p>The financial savings from your solar system(s) is calculated by multiplying your estimated utility rate ($0.10 cents per kWh) by the solar system(s) energy production.</p>\r\n<p class=\"bottom\">For purposes of estimating energy savings, the utility rate is estimated based on averages in your area. The actual energy savings will vary depending on your utility’s specific tariff structure that often includes charges based on a combination of monthly peak demand (measured in kW) and consumption (measured in kWh).</p>");
$templateCache.put("partials/more-panels/solar-energy-generation.html","<div class=\"row\">\r\n    <div class=\"col-sm-8\">\r\n        <p>Your solar modules produce DC power which is sent to your inverters and converted to AC power that your facility is able to use.</p>\r\n    </div>\r\n</div>\r\n<div class=\"row\">\r\n    <div class=\"col-sm-7 padding-top-10\">\r\n        <img class=\"img-responsive\" src=\"/assets/img/solar-energy-generation.png\" />\r\n    </div>\r\n    <div class=\"col-sm-5 padding-top-90\">\r\n        <p>1. Solar panels absorb sunlight and convert it to DC electricity.</p>\r\n        <p>2. DC electricity from the solar panels travels to the inverters where it is converted to AC electricity.</p>\r\n        <p>3. From the inverter, AC electricity passes to the electric service panel (breaker box) where it\'s routed to power your building.</p>\r\n        <p class=\"bottom\">4. When your solar system generates more power than your building is consuming, excess electricity is routed to the power grid. This earns credits on you bill (called net-metering).</p>\r\n    </div>\r\n</div>");
$templateCache.put("partials/more-panels/total-energy-generation.html","<p class=\"bottom\">The Total Energy Generation is the cumulative amount of electricity generated by your system over a given time period.  This value is influenced by many factors, including shading (trees, snow, other buildings, etc.), the change in angle of the sun in the sky throughout the year, the tilt degree of the panels, and changing weather patterns.</p>");}]);
//# sourceMappingURL=maps/app.js.map