angular.module('bl.analyze.solar.surface', [
  'ngTable',
  'ui.bootstrap',
  'highcharts-ng',
  'btford.socket-io',
  'angularMoment',
  'ngAnimate',
  'blComponents.platformPanel',
  'toastr'
])

.constant('wsEntryPoint', window.apiDomain)

.constant('wsConfig', {
  'reconnection delay': 1000,
  'reconnection limit': 1000,
  'max reconnection attempts': 'Infinity'
})

.constant('firstLoadEventList', ['assurf:power', 'assurf:energy', 'assurf:weather'])

.constant('mainStageEventList', ['assurf:solarenergygeneration', 'assurf:savings',
  'assurf:totalenergygeneration', 'assurf:equivalencies', 'assurf:realtimepower',
  'assurf:yieldcomparator', 'assurf:actualpredictedenergy', 'assurf:carbonavoided', 'assurf:sources'])

.constant('tagColors', ['#c654d3', '#9bc02a', '#36d31c', '#468d4f', '#ff7940', '#f44e52', '#fdc35e',
  '#5b74f3', '#60c0ed', '#f183c1'])


.config(['$locationProvider', function ($locationProvider) {
  $locationProvider
    .html5Mode(false)
    .hashPrefix('!');
  /*$routeProvider.
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
    });*/
}])

.run(['$rootScope', '$location', function ($rootScope, $location) {
  $rootScope.panelData = {};
  $rootScope.closePlatformPanel = function () {
    $rootScope.isShowPlatformPanel = false;
    setTimeout(function(){
      $(window).trigger('resize');
    }, 10);
    $location.hash('');
  };

  if ($location.hash().indexOf('ppanel-') > -1) {
    $rootScope.isShowPlatformPanel = true;
  }

  switch ($location.hash()) {
    case 'ppanel-user':
      $rootScope.panelData.menu = 'user';
      break;
    case 'ppanel-account':
      $rootScope.panelData.menu = 'account';
      break;
  }

  $rootScope.LAST_UPDATED_TIMETIME = (new Date()).valueOf();
}]);
angular.module('bl.analyze.solar.surface')
.constant('yieldComparisonChartConfig', {
  chart: {
    height: 145, marginBottom: 40, spacingLeft: 0, spacingRight: 0,
    style: {
      fontSize: '10px', overflow: 'visible'
    }
  },
  tooltip: {
    useHTML: true, borderColor: null, borderWidth: 0, borderRadius: 3,
    shadow: false, spacing: [0,0,0,0], backgroundColor: 'rgba(35, 43, 57, 0.0)',
    style: { color: '#FFFFFF', fontSize: '11px', padding: '20px', whiteSpace: 'normal', zIndex: '99999' },
    shared: true
  },
  title: { text: '' },
  legend: { enabled: false },
  exporting: {enabled: false},
  credits: { enabled: false },
  loading: false,
  yAxis: [
    { opposite: true, title: {align: 'low', offset: 16, text: 'kWh', rotation: 0, y: 20},
      labels: {formatter: function () {return this.value.toLocaleString();}}
    }
  ],
  plotOptions: {
    series: { yAxis: 0, pointWidth: 8 },
    column: { color: '#ff6d2d' },
    spline: { color: '#6b9e67', lineColor: '#6b9e67', lineWidth: 0.6, allowPointSelect: false, marker: {enabled: false}}
  }
})
.controller('elementYieldComparisonController',
  ['$scope', '$interpolate', '$filter', 'moment', 'energyService',
    'SourceSelectionEventService', 'yieldComparisonChartConfig', 'solarTagService',
  function ($scope, $interpolate, $filter, moment, energyService,
    SourceSelectionEventService, chartConfig, solarTagService) {

    $scope.earliestInstallDate = null;

    $scope.isDataLoaded = false;
    $scope.lastYield = null;
    $scope.yieldChartInstance = null;
    $scope.yieldChartConfig = {
      options: chartConfig,
      xAxis: {
        categories: [],
        labels: {
          formatter: function () {
            return moment(this.value).format('MMM YY');
          }
        }
      },
      series: [],
      func: function(yieldChartInstance) {
        $scope.yieldChartInstance = yieldChartInstance;
      }
    };

    var infoPanelTemplate = $interpolate(
      ['<div class="yield-tooltip">',
        '<p class="heading">',
          '<span>{{ currentDate }}: </span>',
          '<span class="kpi">{{ currentKWh|number:0 }} kWh / ${{ current$|number:0 }} </span>',
          '{{infoTextEarliestDate}} <br/>',
          '<span>{{ previousDate }}: </span>',
          '<span class="kpi">{{ previousKWh|number:0 }} kWh / ${{ previous$|number:0 }} </span>',
          '{{infoTextEarliestDate}}',
        '</p>',
        '<p>',
          'Your solar-energy system produced <span class="kpi"> {{ currentKWh|number:0 }}kWh </span>',
          'in the month of {{ currentDate }}{{infoTextPrevious}}',
        '.</p>',
        '<p class="bottom">',
          'For the year so far, your solar-energy system has<br/> produced ',
          '<span class="kpi">{{currentKWhYTD|number:0}}kWh</span>',
          ' saving <span class="kpi">${{ current$YTD|number:0 }}</span>',
          '{{infoTextPreviousYTD}}',
        '.</p>',
        '</div>'
      ].join(''));

    var infoTextEarliestDate = $interpolate('<span class="kpi">Installed: {{earliestInstallDate}}</span>');

    var infoTextPrevious = $interpolate([
      ' which is <span class="kpi"> {{percentCurrVsPrev|number:0}}% ',
      '{{compareLabel}} </span>',
      'than the {{previousKWh|number:0}}kWh produced in the same month the previous year'
    ].join(''));

    var infoTextPreviousYTD = $interpolate([
      ', which is <span class="kpi">{{percentCurrYTDVsPrevYTD|number:0}}% ',
      '{{compareLabelYTD}}</span> than the ',
      '<span class="kpi">{{ previousKWhYTD|number:0 }}kWh</span> produced for the same time frame last year'
    ].join(''));

    $scope.yieldChartConfig.options.tooltip.positioner = function (labelWidth, labelHeight, point) {
      var chart = this.chart;
      var plotTop = chart.plotTop;
      var plotWidth = chart.plotWidth;
      var plotHeight = chart.plotHeight;
      var pointX = point.plotX;
      var pointY = point.plotY;
      var rightOverflow = pointX + labelWidth > plotWidth;
      var leftOverflow = pointX < labelWidth;
      var x, y;
      if (rightOverflow && leftOverflow) {
        x = (pointX > plotWidth / 2) ? plotWidth - labelWidth : 0;
      } else {
        x = rightOverflow ? pointX - labelWidth + 5 : pointX + 15;
      }
      y = Math.min(plotTop + plotHeight - labelHeight + 50,
          Math.max(plotTop, pointY - labelHeight + plotTop + labelHeight / 2));
      return { x: x, y: y };
    };

    $scope.yieldChartConfig.options.tooltip.formatter = function () {
      var index = $scope.lastYield.categories.indexOf(this.x);

      var tooltipContext = {
        currentDate: moment(this.x).format('MMM YYYY'),
        previousDate: moment(this.x).subtract(1, 'years').format('MMM YYYY'),
        infoTextPreviousYTD: '',
        infoTextPrevious: '',
        infoTextEarliestDate: ''
      };

      angular.forEach($scope.lastYield.series, function (serie, serieName) {
        tooltipContext[serieName] = serie.data[index] || 0;
      });

      if (tooltipContext.previousKWhYTD > 0 && tooltipContext.currentKWhYTD > 0) {
        tooltipContext.infoTextPreviousYTD = infoTextPreviousYTD(angular.extend(tooltipContext, {
          percentCurrYTDVsPrevYTD: Math.abs(1 - tooltipContext.currentKWhYTD / tooltipContext.previousKWhYTD) * 100,
          compareLabelYTD: tooltipContext.currentKWhYTD > tooltipContext.previousKWhYTD ? 'greater' : 'less'
        }));
      }

      if (tooltipContext.previousKWh > 0 && tooltipContext.currentKWh !== 0) {
        tooltipContext.infoTextPrevious = infoTextPrevious(angular.extend(tooltipContext, {
          percentCurrVsPrev: Math.abs(1 - tooltipContext.currentKWh / tooltipContext.previousKWh) * 100,
          compareLabel: tooltipContext.currentKWh > tooltipContext.previousKWh ? 'greater' : 'less'
        }));
      } else {
        tooltipContext.infoTextEarliestDate = infoTextEarliestDate({
          earliestInstallDate: $scope.earliestInstallDate
        });
      }

      return infoPanelTemplate(tooltipContext);
    };

    $scope.startWatchYieldComparison = function  () {
      energyService.watchYieldComparison(function (yieldData) {
        $scope.lastYield = yieldData;
        $scope.drawChart(yieldData);
      });

      SourceSelectionEventService.listen(function () {
        $scope.isDataLoaded = false;
        $scope.getEarliestInstallDate();
      });
    };

    $scope.drawChart = function (yieldData) {
      $scope.yieldChartConfig.xAxis.categories = yieldData.categories;
      $scope.yieldChartConfig.series = [
        angular.extend(yieldData.series.currentKWh, {type: 'column'}),
        angular.extend(yieldData.series.previousKWh, {type: 'column', color: '#ccc', allowPointSelect: false}),
        angular.extend(yieldData.series.averageKWh, {type: 'spline'})
      ];

      $scope.isDataLoaded = true;
    };

    $scope.getEarliestInstallDate = function() {
      var earliestInstallDate;
      angular.forEach(solarTagService.getLastUpdatedFacilityList(), function(facility) {
        if (facility.selected === true) {
          if (!earliestInstallDate) {
            earliestInstallDate = facility.commissioningDate;
          } else {
            earliestInstallDate = Math.min((new Date(facility.commissioningDate)).valueOf(),
              (new Date(earliestInstallDate)).valueOf());
          }
        }
      });
      $scope.earliestInstallDate = moment(earliestInstallDate).format('MMM YYYY');
    };
  }
])
.directive('elementYieldComparison',
  function() {
    return {
      restrict: 'E',
      scope: true,
      controller: 'elementYieldComparisonController',
      templateUrl: 'app/elements/yield-comparison/template.html',
      link : function (scope, element, attrs) {
        scope.startWatchYieldComparison();
        scope.getEarliestInstallDate();
      }
    };
});

angular.module('bl.analyze.solar.surface')
    .constant('elementWeatherHistoryConfig', {
        weatherCountPerRequest: 10,
        weatherStatus: ['cloudy', 'rain', 'snow', 'snow-clear', 'storm', 'sun-cloud', 'sun-rain', 'sunny']
    })

    .controller('elementWeatherHistoryController',
    ['$scope', 'moment', 'weatherService', 'elementWeatherHistoryConfig',
        function ($scope, moment, weatherService, config) {

      $scope.weatherHistory = [];
      $scope.requestDateRange = {
        start: moment().subtract(config.weatherCountPerRequest + 5, 'days').valueOf(),
        end: moment().subtract(1, 'days').valueOf()
      };

            $scope.loadMoreHistories = function () {
                if ($scope.isLoadingAdditionalHistory) {
                    return false;
                }

                $scope.isLoadingAdditionalHistory = true;
                var lastHistory = $scope.weatherHistory[$scope.weatherHistory.length - 1],
                    additionalHistoryEnd = moment(lastHistory.date).subtract(1, 'days').valueOf(),
                    additionalHistoryStart = moment(additionalHistoryEnd)
                        .subtract(config.weatherCountPerRequest, 'days').valueOf();

                $scope.emitRequestForWeatherHistory(additionalHistoryStart, additionalHistoryEnd);
            };

            $scope.$watchGroup(['requestDateRange.start', 'requestDateRange.end'], function(newValues, oldValues) {
                if (newValues[0] !== oldValues[0] || newValues[1] !== oldValues[1]) {
                    $scope.weatherHistory = [];
                    $scope.emitRequestForWeatherHistory(newValues[0], newValues[1]);
                }
            });

            $scope.emitRequestForWeatherHistory = function (startDate, endDate) {
                weatherService.emitToWeatherHistory(startDate, endDate);
            };

            $scope.startWatchWeatherHistoryResponse = function () {
                weatherService.watchWeatherHistory(function (history) {
                    $scope.isDataLoaded = true;
                    if ($scope.isLoadingAdditionalHistory) {
                        $scope.weatherHistory = $scope.weatherHistory.concat(history.reverse());
                        $scope.isLoadingAdditionalHistory = false;
                    } else {
                        $scope.weatherHistory = history.reverse();
                    }
                });
            };
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
                scope.emitRequestForWeatherHistory(scope.requestDateRange.start, scope.requestDateRange.end);
                scope.startWatchWeatherHistoryResponse();
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
                            onTotalScroll:function() {
                                console.log('Ivan wants to get more weather history');
                                scope.loadMoreHistories();
                            },
                            onTotalScrollOffset:50,
                            alwaysTriggerOffsets:false
                        }
                    });
                });
            }
        };
    }]);

angular.module('bl.analyze.solar.surface')

  .controller('elementTEGController',
  ['$scope', '$filter', '$interpolate', 'energyService', 'SourceSelectionEventService', 'asDateRangeSelectorConfig',
    'kmService',
  function($scope, $filter, $interpolate, energyService, SourceSelectionEventService, asDateRangeSelectorConfig,
           kmService) {
    $scope.isDataLoaded = false;
    $scope.dateRange = 'month';
    $scope.lastTEG = {
      'value' : 0,
      'unit': 'kWh'
    };

    $scope.extraInfo = 'A Megawatt-hour is equal to 1,000 kilowatt hours, ' +
        'or 1,000 kilowatts of electricity used continuously for one hour';

    var infoPanelTextSrc = 'Your system produced <span class="kpi">' +
        '{{ TEG }} {{TEGUnit}}</span> {{ dateRange }}{{ extraInfo }}.';

    $scope.infoPanelText = infoPanelTextSrc;

    $scope.$watch('dateRange', function(newVal,oldVal) {
      if (newVal !== oldVal) {
        $scope.isDataLoaded = false;
        energyService.emitTEG(newVal);

        //Kissmetrics tracking
        var contentObj = {'Element':'Total Energy Production',
          'dateRange': asDateRangeSelectorConfig.labels[$scope.dateRange]};
        kmService.trackEvent('record', 'Click', contentObj);
      }
    });

    $scope.startWatchTEG = function () {
      energyService.watchTEG(function (TEG) {
        $scope.lastTEG = TEG;
        $scope.infoPanelText = $interpolate(infoPanelTextSrc)({
          TEG: TEG < 1000 ? $filter('number')(TEG.value, 1) : $filter('number')(TEG.value/1000, 1),
          TEGUnit:TEG < 1000 ? 'KWh' : 'MWh',
          dateRange: $scope.dateRange === 'total' ? 'as total' : 'over the last ' + $scope.dateRange,
          extraInfo: TEG < 1000 ? '' : ', or '+$filter('number')(TEG.value, 0)+' kWh. '+ $scope.extraInfo
        });
        $scope.isDataLoaded = true;
        $scope.lastTEG.value = TEG < 1000 ? $filter('number')(TEG.value, 1) : $filter('number')(TEG.value/1000, 1);
        $scope.lastTEG.unit = TEG < 1000 ? 'KWh' : 'MWh';
      });
    };

    SourceSelectionEventService.listen(function () {
      $scope.isDataLoaded = false;
    });

    $scope.startWatchTEG();
  }])
  .directive('elementTotalEnergyProduction', ['$modal', function ($modal) {
    /*var openDrilldown = function () {
      return $modal.open({
        templateUrl: 'app/elements/solar-energy-production/drilldown.html',
        controller: 'EnergyProductionDrilldownCtrl',
        windowClass: 'drilldown',
        size: 'lg',
        resolve: {
          parentScope: function() {
            return scope;
          }
        }
      });
    };*/

    return {
      restrict: 'E',
      scope: true,
      controller: 'elementTEGController',
      templateUrl: 'app/elements/total-energy-production/template.html',
      link : function ($scope, element) {

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
              return '<span>' + date + '</span> <br><span class="kpi">' +
                this.point.value.toFixed(2) + ' Sun-hours</span>  <br><br>' +
                '<span>On ' + date + ', the sun rose at </span> <br>' +
                '<span>6:21am and set at 6:47pm, and it </span> <br>' +
                '<span>was a mostly sunny day. Due to the </span> <br>' +
                '<span>angle of the sun at this time of year, </span> <br>' +
                '<span>the sun’s maximum potential is </span> <br>' +
                '<span>relatively small, so there were only </span> <br>' +
                '<span class="kpi">' + this.point.value.toFixed(2) +
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
angular
.module('bl.analyze.solar.surface')

.constant('segPrimaryChartConfig', {
    chart: {
      marginBottom: 30,
      spacingLeft: 0, spacingRight: 0,
      reflow: true, style: { fontSize: '11px', overflow: 'visible' }
    },
    tooltip: {
      useHTML: true, borderColor: null, borderWidth: 0, borderRadius: 3, shadow: false, shape: 'callout',
      spacing: [0, 0, 0, 0], shared: true, backgroundColor: 'rgba(35, 43, 57, 0.0)',
      style: {padding: '20px', whiteSpace: 'normal', zIndex: '99999'}
    },
    yAxis: [{
      title: null, opposite: true,
      labels: {formatter: function(){return this.value.toLocaleString() + ' kWh';}}
    }, {
      title: null, opposite: true,
      labels: {formatter: function(){return '$' + this.value.toLocaleString();}, style:{color:'#6b9e67'}},
      offset: 80, min: 0
    }],
    title: { text: null }, loading: false, credits: { enabled: false }
})

.controller('elementSolarEnergyProductionController',
  ['$rootScope', '$scope', '$interpolate', '$filter', '$modal', 'moment', 'energyService',
    'SourceSelectionEventService', 'segPrimaryChartConfig', 'asDateRangeSelectorConfig', 'kmService',
  function ($rootScope, $scope, $interpolate, $filter, $modal, moment, energyService,
    SourceSelectionEventService, primaryChartConfig, asDateRangeSelectorConfig, kmService) {

    var windowWidth = $(window).width();
    if (windowWidth < 768) {
      primaryChartConfig.yAxis[0].title = {align: 'low', offset: 16, text: 'kWh', rotation: 0, y: 20};
      primaryChartConfig.yAxis[0].labels = {formatter: function(){return this.value.toLocaleString();}};
      primaryChartConfig.yAxis[1].labels = {enabled: false, x: 0};
      primaryChartConfig.yAxis[1].offset = 0;
    }

    $scope.dateRange = 'month';
    $scope.currentDate = moment().month();
    $scope.currentDateLabel = moment().month($scope.currentDate).format('MMMM');
    $scope.prevDateLabel = moment().month($scope.currentDate-1).format('MMMM');
    $scope.nextDateLabel = moment().month($scope.currentDate+1).format('MMMM');
    $scope.isDataLoaded = false;
    $scope.segMainChartInstance = null;
    $scope.segMainChartConfig = {
      options: primaryChartConfig,
      xAxis: { categories: [], labels: {} },
      series: [],
      chart: { marginBottom: 30 },
      func: function(segMainChartInstance) {
        $scope.segMainChartInstance = segMainChartInstance;
      }
    };

    $scope.lastSEG = null;

    if($scope.currentDate === 0) {
      $('.date-range-nav .prev-nav').removeClass('active');
    } else {
      $('.date-range-nav .prev-nav').addClass('active');
    }

    $scope.printedDays = [];

    var infoTextTemplate = $interpolate([
      '<div class="float-panel-info"><h5 class="title">Energy Production</h5><h5 class="title-date">{{ currentDate }}' +
      '</h5>',
      '<p>Total production for all selected sources on {{ currentDate }} is ',
      '<span class="kpi">{{ totalEnergy|number:2 }} kWh</span>.<br/>',
      'Total Saving is <span class="green">${{totalSaving|number:2}}</span>.</p>',
      '<div class="row"><div class="col-xs-12 text-right">{{currentDate}}</div></div>',
      '{{ generationPerSources }}',
      '<p class="bottom">Last update at {{lastUpdatedTime}}.</p>',
      '</div>'
    ].join(''));

    $scope.segMainChartConfig.options.tooltip.formatter = function () {
      var index = this.point ? this.point.x : this.points[0].point.x,
          series = $scope.lastSEG.primary.series,
          categories = $scope.lastSEG.primary.categories;

      var generationPerSources = '';

      for(var idx = 2; idx < series.length; idx++) {
        if(idx < 7) {
          generationPerSources += '<div class="row"><div class="col-xs-7"><span class="wrap-text">' +
            series[idx].displayName + ':</span></div>' +
            '<div class="col-xs-5 text-right"><span style="color:' + series[idx].color + ';">' +
            $filter('number')(series[idx].data[index], 2) + 'kWh</span></div></div>';
        }
        if(idx === 7){
          generationPerSources += '<div class="row"><div class="col-xs-8">More...</div></div>';
        }
      }

      var dateFormat;
      if ($scope.dateRange === 'week') {
        dateFormat = 'MMM D, hA';
      } else if ($scope.dateRange === 'month') {
        dateFormat = 'MMM D';
      } else if ($scope.dateRange === 'year') {
        dateFormat = 'MMM, YYYY';
      } else if ($scope.dateRange === 'total') {
        dateFormat = 'MMM, YYYY';
      } else {
        dateFormat = 'MMM D, YYYY';
      }

      return infoTextTemplate({
        currentDate: $filter('amDateFormat')(categories[index], dateFormat),
        generationPerSources: generationPerSources,
        totalEnergy: series[0].data[index],
        totalSaving: series[1].data[index],
        lastUpdatedTime: $filter('amCalendar')($rootScope.LAST_UPDATED_TIMETIME).toLowerCase()
      });
    };

    $scope.$watch('dateRange', function (newValues, oldValues) {
      if (newValues !== oldValues) {
        $scope.changeDateRange(newValues);

        //Kissmetrics tracking
        var contentObj = {'Element':'Solar Energy Generation',
          'dateRange': asDateRangeSelectorConfig.labels[$scope.dateRange]};
        kmService.trackEvent('record', 'Click', contentObj);
      }
    });

    SourceSelectionEventService.listen(function () {
      $scope.isDataLoaded = false;
    });

    $scope.startWatchSEG = function () {
      energyService.watchSEG(function (segData) {
        $scope.lastSEG = segData;
        if (segData.dateRange === $scope.dateRange) {
          $scope.drawPrimaryGraph(segData.primary);
          $scope.isDataLoaded = true;
        }
      });
      /*energyService.watchSEGDrilldown(function (drilldown) {
        console.log('SEG drilldown:', drilldown);
      });*/
    };

    $scope.getDataByDateRange = function (dateRange) {
      var requestData = {
        dateRange: dateRange || 'month'
      };

      switch(requestData.dateRange) {
        case 'month':
          if($scope.currentDate !== moment().month()) {
            angular.extend(requestData, {
              month: $scope.currentDate,
              year: moment().year()
            });
          }
          break;
        case 'year':
          if($scope.currentDate !== moment().year()) {
            requestData.year = $scope.currentDate;
          }
          break;
      }

      energyService.emitSEG(requestData);

      $scope.isDataLoaded = false;
    };

    $scope.changeDateRange = function(dateRange) {
      switch(dateRange) {
        case 'week':
          $scope.currentDate = $filter('date')(new Date(), 'w');
          $scope.currentDateLabel = '';
          $scope.prevDateLabel = '';
          $scope.nextDateLabel = '';
          $('.date-range-nav .prev-nav').removeClass('active');
          $('.date-range-nav .next-nav').removeClass('active');
          break;
        case 'month':
          $scope.currentDate = moment().month();
          $scope.currentDateLabel = moment().month($scope.currentDate).format('MMMM');
          $scope.prevDateLabel = moment().month($scope.currentDate-1).format('MMMM');
          $scope.nextDateLabel = moment().month($scope.currentDate+1).format('MMMM');
          if($scope.currentDate === 0) {
            $('.date-range-nav .prev-nav').removeClass('active');
          } else {
            $('.date-range-nav .prev-nav').addClass('active');
          }
          $('.date-range-nav .next-nav').removeClass('active');
          break;
        case 'year':
          $scope.currentDate = moment().year();
          $scope.currentDateLabel = 'Year ' + $scope.currentDate;
          $scope.prevDateLabel = ($scope.currentDate-1);
          $scope.nextDateLabel = ($scope.currentDate+1);
          $('.date-range-nav .prev-nav').addClass('active');
          $('.date-range-nav .next-nav').removeClass('active');
          break;
        case 'total':
          $scope.currentDate = 0;
          $scope.currentDateLabel = 'Total';
          $scope.prevDateLabel = '';
          $scope.nextDateLabel = '';
          $('.date-range-nav .prev-nav').removeClass('active');
          $('.date-range-nav .next-nav').removeClass('active');
          break;
      }

      $scope.getDataByDateRange(dateRange);
    };

    $scope.prevDate = function() {
      switch($scope.dateRange) {
        case 'month':
          $scope.currentDate = Math.max($scope.currentDate - 1, 0);
          $scope.currentDateLabel = moment().month($scope.currentDate).format('MMMM');
          $scope.prevDateLabel = moment().month($scope.currentDate-1).format('MMMM');
          $scope.nextDateLabel = moment().month($scope.currentDate+1).format('MMMM');
          if($scope.currentDate === 0) {
            $('.date-range-nav .prev-nav').removeClass('active');
          } else {
            $('.date-range-nav .prev-nav').addClass('active');
          }
          $('.date-range-nav .next-nav').addClass('active');
          break;
        case 'year':
          $scope.currentDate = Math.max($scope.currentDate - 1, 2014);
          $scope.currentDateLabel = 'Year ' + $scope.currentDate;
          $scope.prevDateLabel = ($scope.currentDate-1);
          $scope.nextDateLabel = ($scope.currentDate+1);
          if($scope.currentDate === 2014) {
            $('.date-range-nav .prev-nav').removeClass('active');
          } else {
            $('.date-range-nav .prev-nav').addClass('active');
          }
          $('.date-range-nav .next-nav').addClass('active');
          break;
      }

      $scope.getDataByDateRange($scope.dateRange);
    };

    $scope.nextDate = function() {
      switch($scope.dateRange) {
        case 'month':
          $scope.currentDate = Math.min($scope.currentDate + 1, moment().month());
          $scope.currentDateLabel = moment().month($scope.currentDate).format('MMMM');
          $scope.prevDateLabel = moment().month($scope.currentDate-1).format('MMMM');
          $scope.nextDateLabel = moment().month($scope.currentDate+1).format('MMMM');
          $('.date-range-nav .prev-nav').addClass('active');
          if($scope.currentDate === moment().month()) {
            $('.date-range-nav .next-nav').removeClass('active');
          } else {
            $('.date-range-nav .next-nav').addClass('active');
          }
          break;
        case 'year':
          $scope.currentDate = Math.min($scope.currentDate + 1, moment().year());
          $scope.currentDateLabel = 'Year ' + $scope.currentDate;
          $scope.prevDateLabel = ($scope.currentDate-1);
          $scope.nextDateLabel = ($scope.currentDate+1);
          if($scope.currentDate === moment().year()) {
            $('.date-range-nav .next-nav').removeClass('active');
          } else {
            $('.date-range-nav .next-nav').addClass('active');
          }
          $('.date-range-nav .prev-nav').addClass('active');
          break;
      }

      $scope.getDataByDateRange($scope.dateRange);
    };

    $scope.drawPrimaryGraph = function(primaryChart) {
      var newSeries = [],
          chartBottom = 30;
      var areaOptions = {
        type : 'areaspline', threshold : null, allowPointSelect: false, color: '#6b9e67',
        fillOpacity: '0.1', lineColor: '#6b9e67', trackByArea: false, stickyTracking: false,
        lineWidth: 2, marker: { enabled: false }, yAxis: 1
      };
      var columnOptions = {
        type: 'column', color: '#ff7935', pointWidth: 8, borderWidth: 0, borderColor: null
      };

      for (var idx = 0; idx < primaryChart.series.length; idx++) {
        if(primaryChart.series[idx].name === 'Total Generation') {
          angular.extend(columnOptions, primaryChart.series[idx]);
        } else if(primaryChart.series[idx].name === 'Savings') {
          angular.extend(areaOptions, primaryChart.series[idx]);
        }
      }

      switch($scope.dateRange) {
        case 'week':
          chartBottom = 80;
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

      $scope.printedDays = [];
      $scope.showDays = [];
      $scope.segMainChartConfig.options.chart.marginBottom = chartBottom;
      $scope.segMainChartConfig.chart.marginBottom = chartBottom;
      var nCount = -1;
      var flag = false;
      var nInterval = 3;

      $scope.segMainChartConfig.xAxis.categories = primaryChart.categories.map(function (value) {
        var format;
        nCount++;
        if ($scope.dateRange === 'week') {          
          var day = $filter('amDateFormat')(value, 'MMM D');          
          if ($scope.printedDays.indexOf(day) < 0) {
            $scope.printedDays.push(day);
            format = 'MMM D, h a';
            if(nCount % nInterval === 0) {
                $scope.showDays.push(nCount);
            }else{
                flag = true;
            }
          } else {
            format = 'h a';
            if(nCount % nInterval === 0) {
              $scope.showDays.push(nCount);
              if(flag === true) {
                format = 'MMM D, h a';
                flag = false;
              }                  
            }
          }
        } else if ($scope.dateRange === 'month') {
          format = 'D';
          if ($filter('amDateFormat')(value, format) === '1') {
            format = 'MMM D';
          }
        } else if ($scope.dateRange === 'year') {
          format = 'MMM';
        } else if ($scope.dateRange === 'total') {
          format = 'MMM, YYYY';
        }

        return $filter('amDateFormat')(value, format);
      });

      $scope.segMainChartConfig.xAxis.tickPositioner = function() {
          if($scope.dateRange === 'week') {
            return $scope.showDays;
          }  
      };

      if($scope.dateRange === 'week') {            
            $scope.segMainChartConfig.xAxis.labels.rotation = -45;
      } else {
            $scope.segMainChartConfig.xAxis.labels.rotation = 0;
      }

      $scope.segMainChartConfig.series = newSeries;
    };

    $scope.openDrilldown = function () {
      $modal.open({
        templateUrl: 'app/elements/solar-energy-production/drilldown.html',
        controller: 'EnergyGenerationDrilldownCtrl',
        windowClass: 'drilldown',
        size: 'lg',
        resolve: {
          'lastSEG': function () {
            return $scope.lastSEG;
          },
          'currentDate': function () {
            return $scope.currentDate;
          }
        }
      });
    };
  }
])

.directive('elementSolarEnergyProduction', function() {
  return {
    restrict: 'E',
    scope: true,
    controller: 'elementSolarEnergyProductionController',
    templateUrl: 'app/elements/solar-energy-production/template.html',
    link : function (scope, element, attrs) {
      scope.startWatchSEG();
    }
  };
});

angular.module('bl.analyze.solar.surface')

.constant('candleStickChartConfig', {
  chart: {
    marginBottom: 60, marginRight: 60, spacingLeft: 0, spacingRight: 0, reflow: true, panning: false,
    height: 300,
    style: { fontSize: '11px', overflow: 'visible' }
  },
  navigator : {enabled:false}, navigation : {buttonOptions:{enabled : false}}, scrollbar : {enabled:false},
  rangeSelector : { enabled : false }, loading: false, credits: { enabled: false }, title : { text: null },
  tooltip: {
    useHTML: true, borderColor: null, borderWidth: 0, borderRadius: 3, shadow: false,
    spacing: [0,0,0,0], backgroundColor: 'rgba(35, 43, 57, 0.9)', style: {padding: '20px', whiteSpace: 'normal'}
  },
  yAxis: {
    title: null, opposite: true, offset: 50, min: 0,
    labels: { formatter: function() {return this.value.toLocaleString() + ' kWh';}}
  },
  plotOptions: {
    candlestick: {
      color: 'blue',
      upColor: 'red'
    }
  },
  xAxis: { startOnTick: true }
})

.constant('pieChartConfig', {
  chart: {
    borderColor: null, reflow: true, height: 494,
    style: { fontSize: '11px' }
  },
  plotOptions: {
    pie: { shadow: false, center: ['50%', '50%'], allowPointSelect: true, dataLabels: { useHTML: true }}
  },
  title: { text: null }, tooltip: {enabled: true}, loading: false, credits: {enabled: false}
})

.controller('EnergyGenerationDrilldownCtrl',
  ['$scope', '$interpolate', '$modalInstance', '$timeout', '$filter', 'moment', 'SourceSelectionEventService',
  'lastSEG', 'currentDate', 'solarTagService', 'energyService', 'savingService', 'candleStickChartConfig',
  'pieChartConfig',
  function($scope, $interpolate, $modalInstance, $timeout, $filter, moment, SourceSelectionEventService,
           lastSEG, currentDate, solarTagService, energyService, savingService, candleConfig, pieChartConfig) {
    $scope.lastSEG = lastSEG;
    $scope.lastSEGDrilldown = null;
    $scope.currentDate = currentDate;
    $scope.tableChart = {
      'data': [],
      'columns': []
    };
    $scope.isDataLoaded = {
      candle: false,
      pie: false,
      table: false
    };

    var tootipContents = $interpolate([
      '<div class="blue-box"><h5 class="title">Power Generation for the Month<br/> ',
        '{{currentDate|amDateFormat:"MMMM, YYYY"}} </h5>',
      '<div class="row"><div class="col-xs-6"<span>{{ initialDate }} :</span></div>',
        '<div class="col-xs-6 text-right"><span class="orange">{{ initialValue|number:2 }}kWh</span></div></div>',
      '<div class="row"><div class="col-xs-6"><span>Min Day : {{ minDate }}</span></div>',
        '<div class="col-xs-6 text-right"><span class="green">{{ minValue|number:2 }}kWh</span></div></div>',
      '<div class="row"><div class="col-xs-6"><span>Max Day : {{ maxDate }}</span></div>',
        '<div class="col-xs-6 text-right"><span class="blue"> {{ maxValue|number:2 }}kWh</span></div></div>',
      '<div class="row"><div class="col-xs-6"><span>{{ finalDate }}</span></div>',
        '<div class="col-xs-6 text-right"><span class="orange"> {{ finalValue|number:2 }}kWh</span></div></div>',
      '</div>'].join(''));

    function getCandlestickData (data) {
      return data.map(function (item) {
        return [item.timestamp, item.initial, item.maximum, item.minimum, item.final];
      });
    }

    $scope.initCharts = function () {
      $scope.candleChartConfig = {
        options: candleConfig,
        useHighStocks: true,
        xAxis: {
          labels: {formatter:function(){return moment(this.value).format('MMM, YYYY');}}
        },
        series: [{
          type: 'candlestick',
          name: 'Energy',
          color: 'rgba(255, 121, 64, 0.9)',
          lineColor: 'rgba(254, 189, 159, 0.9)',
          upColor: 'rgba(254, 189, 159, 0.9)',
          states: {hover: {enabled: false}},
          dataGrouping: {enabled: false},
          data: []
        }]
      };

      $scope.candleChartConfig.options.tooltip.formatter = function () {
        var index = this.points[0].point.index,
            minDate = $scope.lastSEGDrilldown.candlestick.series.data[index].minimumTimestamp,
            maxDate = $scope.lastSEGDrilldown.candlestick.series.data[index].maximumTimestamp;

        return tootipContents({
          currentDate: this.x / 1000,
          initialDate: moment(this.x).startOf('month').format('MMMM Do'),
          initialValue: this.points[0].point.open,
          minDate: moment(minDate).format('MMMM Do'),
          minValue: this.points[0].point.low,
          maxDate: moment(maxDate).format('MMMM Do'),
          maxValue: this.points[0].point.high,
          finalDate: moment(this.x).endOf('month').format('MMMM Do'),
          finalValue: this.points[0].point.close
        });
      };

      $scope.pieChartConfig = pieChartConfig;
      $scope.pieChartConfig.legend = {
        enabled: true,
        layout: 'vertical',
        align: 'center',
        width: 200,
        itemWidth: 200,
        verticalAlign: 'bottom',
        useHTML: true,
        labelFormatter: function() {
          return '<div style="text-align: left; white-space: pre-wrap; width: 200px">' + this.name + '</div>';
        }
      };
      $scope.pieChartConfig.series = [{
        type: 'pie',
        name: 'Total kWh',
        data: [],
        size: '40%',
        dataLabels: {
          formatter: function () {
            return '<div class="pie-datalabel-total"><b class="value">' +
              $filter('number')(this.y, 0) +
              '</b><br /><span>kWh Total</span></div>';
          },
          verticalAlign: 'middle', inside: true, overflow: 'justify',
          x: 0, distance: -80
        },
        tooltip: {pointFormat: '<b>{point.y:.1f} kWh</b>'}
      },{
        type: 'pie',
        data: [],
        innerSize: '50%',
        size: '80%',
        dataLabels: {
          formatter: function () {
            return '<div class="pie-datalabel-point">' + this.point.name + '<br />' +
              '<b class="value">' + $filter('number')(this.y, 1) + '%</b></div>';
          },
          crop: false,
          connectorColor: '#cccccc',
          distance: 0,
          enabled: false,
          allowPointSelect: true
        },
        tooltip: {pointFormat: '<b>{point.y:.1f}%</b>'},
        showInLegend: true
      }];
/*
      $scope.pieChartConfig = {
        options: pieChartConfig,
        legend: {
          enabled: true,
          layout: 'vertical',
          align: 'right',
          width: 200,
          verticalAlign: 'middle',
          useHTML: true,
          labelFormatter: function() {
            return '<div style="text-align: left; width:130px;float:left;">' + this.name + '</div>';
          }
        },
        series: [{
          type: 'pie',
          name: 'Total kWh',
          data: [],
          size: '40%',
          dataLabels: {
            formatter: function () {
              return '<div class="pie-datalabel-total"><b class="value">' +
                $filter('number')(this.y, 0) +
                '</b><br /><span>kWh Total</span></div>';
            },
            verticalAlign: 'middle', inside: true, overflow: 'justify',
            x: 0, distance: -80
          },
          tooltip: {pointFormat: '<b>{point.y:.1f} kWh</b>'}
        },{
          type: 'pie',
          data: [],
          innerSize: '50%',
          size: '80%',
          dataLabels: {
            formatter: function () {
              return '<div class="pie-datalabel-point">' + this.point.name + '<br />' +
                '<b class="value">' + $filter('number')(this.y, 1) + '%</b></div>';
            },
            crop: false,
            connectorColor: '#cccccc',
            distance: 0,
            enabled: false,
            allowPointSelect: true
          },
          tooltip: {pointFormat: '<b>{point.y:.1f}%</b>'},
          showInLegend: true
        }]
      };*/
    };

    $scope.startWatchDrilldown = function () {
      energyService
        .watchSEGDrilldown(function (drilldownData) {
          $scope.lastSEGDrilldown = drilldownData;
          $scope.drawCandleStick(drilldownData);
        })
        .watchSEG(function (seg) {
          $scope.lastSEG = seg;
          $scope.drawPieChart(seg);
        });

      savingService
        .watchTable(function (table) {
          $scope.updateTable(table);
        });
    };

    SourceSelectionEventService.listen(function () {
      angular.extend($scope.isDataLoaded, {
        candle: false,
        pie: false,
        table: false
      });
    });

    $scope.drawCandleStick = function (segDrilldownData) {
      $scope.candleChartConfig.series[0].data = getCandlestickData(segDrilldownData.candlestick.series.data);
      $scope.candleChartConfig.xAxis.tickPositions = segDrilldownData.candlestick.series.data.map(function(row) {
        return row.timestamp;
      });
      $scope.isDataLoaded.candle = true;
    };

    $scope.drawPieChart = function (segData) {
      var newSeries = [],
          newTotal = [];
      angular.forEach(segData.pie.series[0].data, function (data) {
        newSeries.push({
          name: data[0],
          y: data[1],
          color: data[2]
        });
      });

      newTotal.push({
        name: 'Total kWh',
        y: segData.kpiData.totalProduction,
        color: '#fff'
      });

      $scope.pieChartConfig.series[0].data = newTotal;
      $scope.pieChartConfig.series[1].data = newSeries;
      console.log($scope.pieChartConfig);
      $('#gpsPieChart').highcharts($scope.pieChartConfig);
      $scope.isDataLoaded.pie = true;
    };

    $scope.updateTable = function(data) {
      $scope.tableChart = {
        data: data,
        columns: $scope.lastSEG.kpiData.totalProductionBySources.map(function (production) {
          return production.displayName;
        }),
        sourceNames: $scope.lastSEG.kpiData.totalProductionBySources.map(function (production) {
          return production.name;
        })
      };
      $scope.isDataLoaded.table = true;
    };

    $scope.closeDrilldown = function () {
      $modalInstance.dismiss('cancel');
    };

    $timeout(function () {
      $scope.initCharts();
      $scope.startWatchDrilldown();
      $scope.drawPieChart(lastSEG);
    }, 20);
}]);

angular.module('bl.analyze.solar.surface')
  .controller('ElementSavingController', ['$scope', 'savingService', 'SourceSelectionEventService',
    'asDateRangeSelectorConfig', 'kmService',
    function($scope, savingService, SourceSelectionEventService, asDateRangeSelectorConfig, kmService) {
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

          //Kissmetrics tracking
          var contentObj = {'Element':'Savings',
            'dateRange': asDateRangeSelectorConfig.labels[$scope.dateRange]};
          kmService.trackEvent('record', 'Click', contentObj);
        }
      });

      $scope.startWatchSavings = function () {
        savingService
          .watch(function (savingData) {
            angular.extend($scope.lastSavingData, savingData);
            $scope.isDataLoaded = true;
          });
      };

      $scope.startWatchSavings();
    }])
  .directive('elementSavings', ['$modal',
    function($modal) {
      return {
        restrict: 'E',
        scope: true,
        templateUrl: 'app/elements/savings/template.html',
        controller: 'ElementSavingController',
        link : function (scope, element) {
          /*element.on('click', '.widget', function () {
            $modal.open({
              templateUrl: 'app/elements/savings/drilldown.html',
              controller: 'SavingsDrilldownController',
              windowClass: 'drilldown',
              size: 'lg',
              resolve: {
                primaryElementData: function () {
                  return scope.lastSavingData;
                },
                dateRange: function () {
                  return scope.dateRange;
                }
              }
            });
          });*/
        }
      };
    }]);
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
  ['$scope', '$modalInstance', '$timeout', '$interpolate', '$filter', 'dateRange', 'primaryElementData',
    'savingService', 'solarTagService', 'savingChartConfig',
    function ($scope, $modalInstance, $timeout, $interpolate, $filter, dateRange, primaryElementData,
              savingService, solarTagService, chartConfig) {

      var getResponsiveChartHeight = function () {
        var windowHeight = $(window).height();
        var chartHeight = 320;
        if(windowHeight > 1048) {
          chartHeight += windowHeight - 1048;
        }
        return chartHeight;
      };

      var xAxisFormatter = function () {
        var format;

        if (dateRange === 'week') {
          format = 'MMM D ha';
        } else if (dateRange === 'month') {
          format = 'MMM D';
        } else {
          format = 'MMM YYYY'; // or 'MMM D YYYY`
        }

        return $filter('amDateFormat')(this.value, format);
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
          xAxis: { categories: [], labels: { formatter: xAxisFormatter }},
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
          xAxis: { categories: [], labels: { formatter: xAxisFormatter } },
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
            serie.tooltip = {valuePrefix: '$'};
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

      $scope.comboTooltipFormatter = function () {
//        var pointX = this.point ? this.point.x : this.points[0].point.x;
//        var colors = ['orange', 'blue', 'green'];
        var tootipContents = [
          '<div class="blue-box"><h5 class="title">Saving<br/>{{ dateX }}</h5>',
          '{{ infoTable }}',
          '</div>'
        ];
        /*for (var idx = 0; idx < )
        if(scope.mainChart.series.length > 2) {
          tootipContents += '<div class="row">' +
            '<div class="col-xs-12 text-right">' +
            '<span>' + changeDateLabel(scope.mainChart.categories[pointX], true) + '</span>' +
            '</div>' +
            '</div>';
          for(var i=2; i<scope.mainChart.series.length; i++) {
            if(i < 7) {
              tootipContents += '<div class="row">' +
                '<div class="col-xs-7">' +
                '<span class="wrap-text">' +
                  solarTagService.getDisplayName(scope.mainChart.series[i].name) + ':</span>' +
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
        tootipContents += '</div>';*/

        return tootipContents.join('');
      };

      $scope.updateAreaChart = function(savingData) {
        savingData.areaChart.series.map(function (serie) {
          serie.tooltip = {valuePrefix: '$'};
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
angular.module('bl.analyze.solar.surface')

  .constant('rtpPrimaryChartConfig', {
    credits: { enabled: false },
    chart: {
      type: 'spline',
      height: 335,
      marginTop: 35,
      marginBottom: 70
    },
    plotOptions: {series:{marker:{enabled: false}}},
    exporting: {enabled: false},
    tooltip: {
      valueSuffix: 'k', backgroundColor: 'rgba(35,43,57,0.0)',
      borderRadius: 3, borderWidth: 0,
      shadow: false, shared: true, useHTML: true,
      crosshairs: { width: 2, color: 'gray', dashStyle: 'shortdot' }
    },
    yAxis: [{
      title: { text: '' }, labels: { format: '{value}kW' },
      opposite: true, min: 0, plotLines: [{ value: 0, width: 0, color: '#808080'}]
    }, {
      gridLineWidth: 0, lineWidth: 0, lineColor: '#cccccc', title: { text: '' }
    }],
    title: { text: null }, loading: false,
    legend: { enabled: false }
  })

  .controller('elementRTPController',
  ['$rootScope', '$scope', '$interpolate', '$filter', '$timeout', '$modal', 'powerService', 'rtpPrimaryChartConfig',
    'energyService', 'solarTagService', 'SourceSelectionEventService', 'asDateRangeSelectorConfig', 'kmService',
    function ($rootScope, $scope, $interpolate, $filter, $timeout, $modal, powerService, rtpPrimaryChartConfig,
     energyService, solarTagService, SourceSelectionEventService, asDateRangeSelectorConfig, kmService) {

      $scope.isDataLoaded = false;
      $scope.dateRange = 'month';
      $scope.noDataRTP = false;
      $scope.lastRTPower = {};

      $scope.elementTitle = 'Max Power';
      var dateRangeToElementTitle = {
        'today': 'Real-Time Power',
        'week': 'Max Power',
        'month': 'Max Power'
      };

      $scope.totalKPITitle = 'Current Day\'s Max';
      var dateRangeToTotalKPITitle = {
        'today': 'Current Power',
        'week': 'Current Hour\'s Max',
        'month': 'Current Day\'s Max'
      };

      $scope.primaryChartInstance = null;
      var infoTextTemplate = $interpolate([
        '<div class="float-panel-info"><div class="info-title">Power Generation</div>',
        '<div class="info-title">{{ theDay }}</div><br/>',
        '<p>Total production for all selected sources {{ theTime }} is ',
        '<span class="kpi">{{ totalPower }}kW</span>.</p>',
        '<div class="info-table"><p>',
        '<span class="info-key">Total Generation</span><span class="info-value kpi">{{ totalPower }}kW</span>',
        '</p>{{ infoTable }}</div>',
        '<p class="bottom">Last update {{ lastUpdatedTime }}</p></div>'
      ].join(''));

      SourceSelectionEventService.listen(function () {
        $scope.isDataLoaded = false;
      });

      $scope.primaryChart = {
        options: rtpPrimaryChartConfig,
        series: [],
        xAxis: {
          categories: [], 
          labels: {} 
          /*startOnTick: true,
          endOnTick: true,*/ /* Do not uncomment this */
          /*labels: {            
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
            }*/
        },
        func: function(primaryChartInstance) {
          $scope.primaryChartInstance = primaryChartInstance;
        }
      };


      $scope.$watch('dateRange', function(newVal,oldVal) {
        if (newVal !== oldVal) {
          $scope.isDataLoaded = false;
          powerService.emitRTPower(newVal);
          $scope.elementTitle = dateRangeToElementTitle[newVal];
          $scope.totalKPITitle = dateRangeToTotalKPITitle[newVal];

          //Kissmetrics tracking
          var contentObj = {'Element':'Max Power',
            'dateRange': asDateRangeSelectorConfig.labels[$scope.dateRange]};
          kmService.trackEvent('record', 'Click', contentObj);
        }
      });

      $scope.primaryChart.options.tooltip.formatter = function () {
        var points = this.points,
          totalPower = 0;
        var index = this.point ? this.point.x : this.points[0].point.x,          
          categories = $scope.lastRTPower.primary.xAxis;

        var datapoints = points.map(function (point, pidx) {
          if (point.series.name === 'Total Generation') {
            return '';
          } else {
            totalPower += Number(point.y.toFixed(1));
            return [
              '<p>',
              '<span class="info-key">' + $scope.lastRTPower.primary.datapoints[pidx].displayName + '</span>',
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
          theDay: $filter('amDateFormat')(categories[index], theDayFormat),
          theTime: theTimeFormat ? 'at ' + $filter('amDateFormat')(categories[index], theTimeFormat) : '',
          totalPower: totalPower.toFixed(1),
          lastUpdatedTime: $filter('amCalendar')($rootScope.LAST_UPDATED_TIMETIME).toLowerCase(),
          infoTable: datapoints.slice(0, 5).join('') + (datapoints.length > 5 ? '<p>More...</p>' : '')
        };

        return infoTextTemplate(tooltipObject);
      };

      $scope.startWatchPower = function () {
        powerService.watchRTPower(function (RTPower) {
          if (RTPower.history === false) {
            $scope.lastRTPower = RTPower;
            $scope.drawPrimaryChart(RTPower.primary);
            $scope.isDataLoaded = true;
          } else {
            $scope.lastRTPower.kpiData = RTPower.kpiData || $scope.lastRTPower.kpiData;
            if (RTPower.primary) {
              $scope.addToPrimaryChart(RTPower.primary);
            }
          }
        });

        solarTagService.watchAllSolarTags(function () {
          if ($scope.dateRange === 'today') {
            powerService.pullLastPowerFromTags($scope.lastRTPower);
          }
        }, false);
      };

      $scope.drawPrimaryChart = function (chartData) {
        $scope.noDataRTP = chartData['xAxis'].length === 0;

        $scope.primaryChart.series = chartData['datapoints'];
        
        /*
        X Axis data decision algorithm
        -Variables
        nInterval: X Axis data showing interval.  nInterval = 3, e.g. 3AM 6M 9AM
        printedDays: store first data per day, no time.
        nCount: X Axis total data count, it will use for MOD operation with nInterval.
        showDays: number of data will show X Axis.
        flag: temporary flag variable for algorithm, it will be true when change next day.
        -Algorithm
          sample  input data:
            June 3th 2AM, 3AM, 4AM, 1PM, 2PM, 3PM, 4PM, 5PM, 6PM, 7PM, 8PM, 
                  9PM, 10PM, 11PM, Jun 4th 12AM, 1AM, 2AM, 3AM, 4AM
          desired output data:
            June 3th 2AM, 1PM, 4PM, 7PM, 10PM, June 4th 1AM, 4AM
          content:
            X Axis shows data per every nInterval(3), if then, 1AM appear instead of Jun 4th 12AM, 
              so flag variable will be used when change next day.
            showDays will push every nInterval(3), if flag is true or current data is first one per day, 
                data showing format will be 'MMM D, h a', otherwise showing format is 'h a'.
        */
        var nCount = -1;                
        $scope.printedDays = [];  
        $scope.showDays = [];
        var flag = false;
        var nInterval = 3;

        $scope.primaryChart.xAxis.categories = chartData['xAxis'].map(function(value) {
            var format;
            nCount++;
            if ($scope.dateRange === 'week') {
              var day = $filter('amDateFormat')(value, 'MMM D');
              if ($scope.printedDays.indexOf(day) < 0) {
                $scope.printedDays.push(day);
                format = 'MMM D, h a';  
                if(nCount % nInterval === 0) {
                    $scope.showDays.push(nCount);
                }else{
                    flag = true;
                }
              } else {
                format = 'h a';
                if(nCount % nInterval === 0) {
                  $scope.showDays.push(nCount);
                  if(flag === true) {
                    format = 'MMM D, h a';
                    flag = false;
                  }                  
                }
              }
            } else if ($scope.dateRange === 'today') {
              format = 'h:mma';
            } else {
              format = 'MMM D';
            }
            return $filter('amDateFormat')(value, format);
        });

        
        $scope.primaryChart.xAxis.tickPositioner = function() {
            if($scope.dateRange === 'week') {
              return $scope.showDays;
            }  
        };        

        if($scope.dateRange === 'week') {            
            $scope.primaryChart.xAxis.tickInterval = 3;
            $scope.primaryChart.xAxis.labels.rotation = -45;
        }else{
            $scope.primaryChart.xAxis.tickInterval = 1;
            $scope.primaryChart.xAxis.labels.rotation = -45;
        }
      };

      $scope.addToPrimaryChart = function (chartData) {
        // $scope.lastRTPower.primary.xAxis
        // $scope.lastRTPower.primary.datapoints
        angular.forEach(chartData.xAxis, function (x, xIndex) {
          var matchIndex = $scope.lastRTPower.primary.xAxis.indexOf(x);

          if (matchIndex > -1) {  // if there is same x-axis
            $scope.lastRTPower.primary.datapoints.map(function (datapoint, serieIndex) {
              datapoint.data[matchIndex] = chartData.datapoints[serieIndex].data[xIndex];
            });

            /*$scope.lastRTPower.primary.datapoints.map(function (datapoint, sourceIndex) {
              datapoint.data[xIndex] = chartData.datapoints[sourceIndex].data[xIndex];
            });*/
          } else {  // if there isn't same xaxis
            $scope.lastRTPower.primary.xAxis.push(x);
            $scope.lastRTPower.primary.datapoints.map(function (datapoint, serieIndex) {
              datapoint.data.push(chartData.datapoints[serieIndex].data[xIndex]);
            });
          }
        });
        $timeout(function () {
          $scope.drawPrimaryChart($scope.lastRTPower.primary);
        }, 10);
      };

      $scope.openDrilldown = function () {
        $modal.open({
          templateUrl: 'app/elements/realtime-power/drilldown.html',
          controller: 'EnergyDrilldownController',
          windowClass: 'drilldown',
          size: 'lg',
          resolve: {
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
        /*element.on('click', function () {
          scope.openDrilldown();
        });*/
      }
    };
  });

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
          infoUnit: this.series.name === 'Energy Produced' ? 'kWh' : 'kW',
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
angular.module('bl.analyze.solar.surface')

.controller('ElementEquivalenciesController',
  ['$scope', '$filter', 'equivalenciesService', 'SourceSelectionEventService', 'asDateRangeSelectorConfig', 'kmService',
  function ($scope, $filter, equivalenciesService, SourceSelectionEventService, asDateRangeSelectorConfig, kmService) {
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

        //Kissmetrics tracking
        var contentObj = {'Element':'Equivalences',
          'dateRange': asDateRangeSelectorConfig.labels[$scope.dateRange]};
        kmService.trackEvent('record', 'Click', contentObj);
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
    /*var openDrilldown = function (lastEquiv) {
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
    };*/
    return {
      restrict: 'E',
      templateUrl: 'app/elements/equivalencies/template.html',
      controller: 'ElementEquivalenciesController',
      replace: true,
      scope: true,
      link : function (scope, element, attrs) {

      }
    };
  }]);

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
angular.module('bl.analyze.solar.surface')
  .controller('ElementAvoidedCarbonController',
    ['$scope', '$filter', '$interpolate', 'equivalenciesService', 'SourceSelectionEventService',
      'asDateRangeSelectorConfig', 'kmService',
    function ($scope, $filter, $interpolate, equivalenciesService, SourceSelectionEventService,
              asDateRangeSelectorConfig, kmService) {
      $scope.isDataLoaded = false;
      $scope.dateRange = 'month';
      $scope.lastCarbonAvoided =  {
        carbonAvoided: 0,
        carbonAvoidedTotal: 0
      };


      var iPanelTextSrc = 'Your system avoided <span class="kpi">{{ Carbon }}lbs</span> of carbon '
                                    + 'dioxide {{ dateRange }}.';
      $scope.infoPanelText = iPanelTextSrc;

      $scope.$watch('dateRange', function (newVal, oldVal) {
        if (newVal !== oldVal) {
          $scope.isDataLoaded = false;
          equivalenciesService.emitCarbonAvoided(newVal);

          //Kissmetrics tracking
          var contentObj = {'Element':'Avoided Carbon Dioxide Emissions',
            'dateRange': asDateRangeSelectorConfig.labels[$scope.dateRange]};
          kmService.trackEvent('record', 'Click', contentObj);
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
      /*var openDrilldown = function (lastEquiv) {
        return $modal.open({
          templateUrl: 'app/elements/equivalencies/drilldown.html',
          controller: 'EquivalenciesDrilldownController',
          windowClass: 'drilldown',
          size: 'lg',
          resolve: {
          }
        });
      };*/

      return {
        restrict: 'E',
        templateUrl: 'app/elements/avoided-carbon/template.html',
        scope: true,
        controller: 'ElementAvoidedCarbonController',
        replace: true,
        link : function (scope, element, attrs) {
        }
      };
    }
  ]);
angular.module('bl.analyze.solar.surface')
  .constant('actualPredictedChartConfig', {
    chart: {
      type: 'column', height: 167, spacingLeft: 0, spacingRight: 0
    },
    tooltip: {
      // shared: true,
      useHTML: true, borderColor: null, borderWidth: 0, borderRadius: 3,
      shadow: false, spacing: [0,0,0,0], backgroundColor: 'rgba(35, 43, 57, 0.0)',
      style: { padding: '20px', whiteSpace: 'normal' },
      shared: true
    },
    title: { text: '' },
    legend: { enabled: false },
    exporting: {enabled: false},
    credits: { enabled: false },
    loading: false,
    colors: ['#ff6d2d', '#d5d9da'],
    yAxis: [{
      title: {text: ''}, opposite: true,
      labels: {
        formatter: function () { return this.value.toLocaleString() + 'kWh'; }
      }
    }]
  })
  .controller('elementActualPredictedController',
  ['$rootScope', '$scope', '$timeout', '$filter', 'moment', 'SourceSelectionEventService',
    'actualPredictedChartConfig', 'energyService', '$interpolate', 'asDateRangeSelectorConfig', 'kmService',
    function($rootScope, $scope, $timeout, $filter, moment, SourceSelectionEventService, chartConfig,
             energyService, $interpolate, asDateRangeSelectorConfig, kmService) {

      var windowWidth = $(window).width();
      if (windowWidth < 768) {
        chartConfig.yAxis[0].title = {align: 'low', offset: 16, text: 'kW', rotation: 0, y: 20};
        chartConfig.yAxis[0].labels = {formatter: function(){return this.value.toLocaleString();}};
      }
      var infoTextTemplate = $interpolate([
        '<div class="float-panel-info">',
        '<div class="row">',
        '<div class="col-xs-6"><h5 class="title">{{ currentDate }}</h5></div>',
        '<div class="col-xs-6"><span>Previous years\' data aids in ',
        '<br/>calculating the current year\'s<br/> predicted energy.</span></div>',
        '</div>',
        '<div class="row">',
        '<div class="col-xs-6"><span class="kpi">{{ currentCloudyDays }}</span></div>',
        '<div class="col-xs-6"></div>',
        '</div>',
        '<div class="row">',
        '<div class="col-xs-6"><span class="kpi">{{ currentSunnyDays }}</span></div>',
        '<div class="col-xs-6"><span><b>{{ prevYearDate }}:</b></span></div>',
        '</div>',
        '<div class="row">',
        '<div class="col-xs-6"></div>',
        '<div class="col-xs-6"><span>{{ prevYearCloudyDays }}</span></div>',
        '</div>',
        '<div class="row">',
        '<div class="col-xs-6"><span class="info-value kpi"><b>Actual: {{ actualEnergy }}</b></span></div>',
        '<div class="col-xs-6"><span>{{ prevYearSunnyDays }}</span></div>',
        '</div>',
        '<div class="row">',
        '<div class="col-xs-6"><span><b>Predicted: {{ predictedEnergy }}</b></span></div>',
        '<div class="col-xs-6"><span>Actual: {{ prevYearActualEnergy }}</span></div>',
        '</div></div>'
      ].join(''));

      $scope.isShowOnlyYear = false;
      $scope.isDataLoaded = false;
      $scope.dateRange = 'year';
      $scope.avpeChartInstance = null;

      $scope.avpeChartConfig = {
        options: chartConfig,
        xAxis: {
          categories: [],
          labels: {
            style: { fontSize: '10px' },
            formatter: function () {
              var format = $scope.isShowOnlyYear ? 'YYYY' : 'MMM YY';
              return moment.utc(this.value).format(format);
            }
          }
        },
        series: [],
        func: function(avpeChartInstance) {
          $scope.avpeChartInstance = avpeChartInstance;
        }
      };

      /*$scope.avpeChartConfig.options.chart.events = {
       load: function() {$scope.isDataLoaded = true;},
       redraw: function() {$scope.isDataLoaded = true;}
       };*/

      $scope.$watch('dateRange', function (newVal, oldVal) {
        if (newVal !== oldVal) {
          $scope.dateRange = newVal;
          $scope.isDataLoaded = false;
          energyService.emitAvPE(newVal);

          //Kissmetrics tracking
          var contentObj = {'Element':'Actual vs Estimated Energy',
            'dateRange': asDateRangeSelectorConfig.labels[$scope.dateRange]};
          kmService.trackEvent('record', 'Click', contentObj);
        }
      });

      SourceSelectionEventService.listen( function () {
        $scope.isDataLoaded = false;
      });

      function formatText(value, unit, total, strDays) {
        var str = '';
        if (!unit) {
          str = value < 0 ? 'No history': value;
        } else {
          str = value < 0 ? 'No history': $filter('number')(value, 2) + ' ' + unit;
        }

        if (total && parseInt(value) >= 0) {
          str = str + ' ' + (strDays || '') + '(' + parseInt(value*100/total) +'%)';
        }
        return str;
      }

      $scope.avpeChartConfig.options.tooltip.formatter = function () {
        //var xAxisDateFormat = isShowYear ? 'YYYY' : 'MMM YYYY';
        var xAxisDateFormat = $scope.isShowOnlyYear ? 'YYYY' : 'MMMM YYYY';

        var currentDate = moment.utc(this.x),
          prevYearDate = moment.utc(this.x).subtract(1, 'years'),
          index = $scope.lastAvPEnergy.categories.indexOf(this.x);

        var daysInCurrent, daysInPrevious;
        var tooltip = $scope.lastAvPEnergy.tooltips[index];

        if ($scope.isShowOnlyYear) {
          daysInCurrent = currentDate.endOf('year').format('DDD');
          daysInPrevious = prevYearDate.endOf('year').format('DDD');
        } else {
          daysInCurrent = currentDate.endOf('month').format('D');
          daysInPrevious = prevYearDate.endOf('month').format('D');
        }

        if (tooltip.cloudydays === -1 && tooltip.sunnydays !== -1) {
          tooltip.cloudydays = 0;
        }
        if (tooltip.sunnydays === -1 && tooltip.cloudydays !== -1) {
          tooltip.sunnydays = 0;
        }
        if (tooltip.prevYearCloudyDays === -1 && tooltip.prevYearSunnyDays !== -1) {
          tooltip.prevYearCloudyDays = 0;
        }
        if (tooltip.prevYearSunnyDays === -1 && tooltip.prevYearCloudyDays !== -1) {
          tooltip.prevYearSunnyDays = 0;
        }

        var infoPanel = {
          currentDate: currentDate.format(xAxisDateFormat),
          prevYearDate: prevYearDate.format(xAxisDateFormat),
          /*currentDate: currentDate.format('MMMM YYYY'),
           prevYearDate: prevYearDate.format('MMMM YYYY'),*/
          actualEnergy: formatText(this.points[0].y, 'kWh'),
          prevYearActualEnergy: formatText(tooltip.prevYearActualEnergy, 'kWh'),
          predictedEnergy: formatText(this.points[1].y, 'kWh'),
          prevYearPredictedEnergy: formatText(tooltip.prevYearPredictedEnergy, 'kWh'),
          currentCloudyDays: formatText(tooltip.cloudydays, false, daysInCurrent, 'Cloudy Days '),
          prevYearCloudyDays: formatText(tooltip.prevYearCloudyDays, false, daysInPrevious, 'Cloudy Days '),
          currentSunnyDays: formatText(tooltip.sunnydays, false, daysInCurrent, 'Sunny Days '),
          prevYearSunnyDays: formatText(tooltip.prevYearSunnyDays, false, daysInPrevious, 'Sunny Days ')
        };

        return infoTextTemplate(infoPanel);
      };

      $scope.startWatchEnergy = function  () {
        energyService.watchAvPE(function (AvPEnergy) {
          $scope.lastAvPEnergy = AvPEnergy;
          $scope.updateChart($scope.lastAvPEnergy);
        });
      };

      $scope.updateChart = function (data) {
        $scope.isShowOnlyYear = data['dimension'] === '1year';

        angular.forEach(data.series, function (serie) {
          if (serie.name === 'Actual Energy') {
            serie.color = '#ff6d2d';
          } else if (serie.name === 'Predicted Energy') {
            serie.color = '#d5d9da';
          }
        });

        $scope.avpeChartConfig.xAxis.categories = data.categories;
        $scope.avpeChartConfig.series = data.series;
        $scope.isDataLoaded = true;
      };

      $scope.startWatchEnergy();
    }
  ])
  .directive('actualPredictedEnergy',
  function () {
    return {
      restrict: 'E',
      scope: true,
      templateUrl: 'app/elements/actual-predicted-energy/template.html',
      controller: 'elementActualPredictedController',
      link: function (scope, element, attrs, controller) {
      }
    };
  }
);
angular.module('bl.analyze.solar.surface')
.factory('weatherService', ['$q', 'moment', 'SocketIO',
  function($q, moment, SocketIO) {
    var today, history, forecast;

    function stripTimezoneFromDateString (originalDate) {
      return originalDate.substr(0, 19);
    }

    function getTodayWeather(rawWeather) {
      today = {
        temperature: {
          now: Math.round(rawWeather.current.temperature),
          min: Math.round(rawWeather.forecast[0].temperatureMin),
          max: Math.round(rawWeather.forecast[0].temperatureMax)
        },
        cityName: rawWeather.current.city,
        air: {
          humidity: Math.round(rawWeather.current.humidity * 100),
          pressure: Math.round(rawWeather.current.pressure),
          windSpeed: Math.round(rawWeather.current.windSpeed)
        },
        sunTime: {
          sunset: stripTimezoneFromDateString(rawWeather.current.sunsetDate),
          sunrise: stripTimezoneFromDateString(rawWeather.current.sunriseDate)
        },
        weatherIcon: 'icon-weather-' + rawWeather.current.icon,
        summary: rawWeather.current.summary,
        lastReportedTime: stripTimezoneFromDateString(rawWeather.current.date)
      };
      return today;
    }

    function getForeWeather(rawWeather) {
      var limitCounts = 5;
      forecast = rawWeather.forecast.slice(1, limitCounts + 1).map(function (forecast) {
        return {
          date: stripTimezoneFromDateString(forecast.date),
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
      history = rawWeather.history.reverse().slice(1, limitCounts + 1).map(function (history) {
        return {
          date: stripTimezoneFromDateString(history.date),
          temperature: {
            min: Math.round(history.temperatureMin),
            max: Math.round(history.temperatureMax)
          }
        };
      });

      return history;
    }

    function getWeatherHistory (rawHistory) {
      return rawHistory.map(function (history) {
        return {
          temperature: {
            low: Math.round(history.temperatureMin),
            high: Math.round(history.temperatureMax)
          },
          air: {
            humidity: Math.round(history.humidity * 100),
            pressure: Math.round(history.pressure),
            windSpeed: Math.round(history.windSpeed)
          },
          sunTime: {
            sunset: stripTimezoneFromDateString(history.sunsetDate),
            sunrise: stripTimezoneFromDateString(history.sunriseDate)
          },
          weatherIcon: 'icon-weather-' + history.icon,
          date: stripTimezoneFromDateString(history.date),
          city: history.city
        };
      });
    }

    return {
      _getTodayWeather: getTodayWeather,
      _getForeWeather: getForeWeather,
      _getHistoricalWeather: getHistoricalWeather,
      _getWeatherHistory: getWeatherHistory,

      watchWeatherHistory: function (callback) {
        SocketIO.watch('assurf:weatherhistory', function (rawData) {
          callback(getWeatherHistory(rawData.history));
        });
      },

      watchWeather: function (callback) {
        SocketIO.watch('assurf:weather', function(weather) {
          callback({
            todayWeather: getTodayWeather(weather),
            foreWeather: getForeWeather(weather),
            historicalWeather: getHistoricalWeather(weather)
          });
        });
      },

      emitToWeatherHistory: function (startDate, endDate) {
        if (endDate < startDate) {
          endDate = [startDate, startDate = endDate][0]; // do swap
        }

        //console.log('Testing ivan:', startDate, endDate);

        SocketIO.emit('assurf:weatherhistory', {
          'dateRange': {
            'from': moment(startDate).format('YYYY-MM-DD'),
            'to': moment(endDate).format('YYYY-MM-DD')
          }
        });
      }
    };
  }
]);
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
angular.module('bl.analyze.solar.surface')
.service('SourceSelectionEventService',
  ['$rootScope', 'SocketIO', 'mainStageEventList',
    function($rootScope, SocketIO, mainStageEventList) {
      var listenCallbacks = [];

      this.broadcast = function(selectedFacilities, selectedScopes, selectedNodes) {

        SocketIO.emit('assurf:selectedsources', {
          'selectedFacilities': selectedFacilities,
          'selectedScopes': selectedScopes,
          'selectedNodes': selectedNodes
        });

        for (var idx = 0; idx < listenCallbacks.length; idx++) {
          listenCallbacks[idx].call(null, {
            facilities: selectedFacilities,
            scopes: selectedScopes,
            nodes: selectedNodes
          });
        }

        return this;
      };

      this.listen = function(callback) {
        for (var idx = 0; idx < listenCallbacks.length; idx++) {
          if (listenCallbacks[idx] === callback) {
            return false;
          }
        }

        listenCallbacks.push(callback);

        return this;
      };


      var mainStageEventListForChecking = {},
        mainStageListenCallbacks = [];
      var resetMSEventListForChecking = function () {
        for (var idx = 0; idx < mainStageEventList.length; idx++) {
          mainStageEventListForChecking[mainStageEventList[idx]] = 0;
        }
      };

      var checkTheyAllLoaded = function(eventName) {

        if (mainStageEventList.indexOf(eventName) > -1) {
          mainStageEventListForChecking[eventName] = 1;

          for (var i = 0; i < mainStageEventList.length; i++) {
            if (mainStageEventListForChecking[mainStageEventList[i]] === 0) {
              return false;
            }
          }

          // Finally MainStage is All Loaded;
          angular.forEach(mainStageListenCallbacks, function (cb) {
            cb();
          });
          resetMSEventListForChecking();

          return true;
        }
        return false;
      };

      resetMSEventListForChecking();
      for (var idx = 0; idx < mainStageEventList.length; idx ++) {
        (function (eventName) {
          SocketIO.watch(eventName, function () {
            checkTheyAllLoaded(eventName);
          });
        })(mainStageEventList[idx]);
      }

      this.resetMainStageChecking = resetMSEventListForChecking;

      this.listenMainStageLoaded = function (callback) {
        mainStageListenCallbacks.push(callback);
      };

    }]);
angular.module('bl.analyze.solar.surface')
  .service('solarTagService', ['$rootScope', '$q', '$window', '$sce', '$filter', 'SocketIO', 'moment', 'tagColors',
    function($rootScope, $q, $window, $sce, $filter, SocketIO, moment, tagColors) {
      var colorList = angular.copy(tagColors);
      var facilityList, lastReportedDateTime = 0;
      var lastFacilityDrilldown;
      var lastTotalCurrentPower = -1;

      function nodeInit(node, scope) {
        node.name = node.displayName || node.name;
        node.percent = '0' || node.percent;
        node.lastReportedValue = '0' || node.lastReportedValue;
        node.displayName = node.displayName || node.name;
        node.selected = node.selected || false;
        node.color = randomColor({luminosity: 'dark'});

        return node;
      }

      function scopeInit(scope, facility) {
        scope.percent = '0' || scope.percent;
        scope.lastReportedValue = '0' || scope.lastReportedValue;
        scope.selected = scope.selected || false;
        scope.nodes = scope.nodes.map(function (node) {
          return nodeInit(node, scope);
        });
        scope.displayName = scope.displayName || scope.name;
        scope.potentialPower = scope.potentialPower || 0;

        scope.color = randomColor({luminosity: 'dark'});
        return scope;
      }

      function facilityInit(facility) {
        facility.percent = '0' || facility.percent;
        facility.lastReportedValue = '0' || facility.lastReportedValue;
        facility.displayName = facility.displayName || facility.name;
        facility.geo = facility.geo || {};
        facility.commissioningDate = facility.commissioningDate
          ? (facility.commissioningDate.split('T')[0])
          : '-';
        facility.potentialPower = facility.potentialPower || 0;
        facility.selected = facility.selected || false;
        facility.scopes = facility.scopes.map(function (scope) {
          return scopeInit(scope, facility);
        });

        if (facility.selected) {
          facility.color = colorList.length ? colorList.pop() : randomColor({luminosity: 'dark'});
        } else {
          facility.color = randomColor({luminosity: 'dark'});
        }

        return facility;
      }

      function nodeUpdate(node, updatedRawNode) {

        angular.extend(node, {
          lastReportedTime: (new Date(updatedRawNode.lastReportedTime)).valueOf(),
          lastReportedValue: (updatedRawNode.lastReportedValue.toFixed(1))/1,
          percent: updatedRawNode.percent,
          totalEnergyGenerated: Math.round(updatedRawNode.totalEnergyGenerated),
          trend: updatedRawNode.trend
        });

        if (node.trend) {
          node.trendText = $sce.trustAsHtml(node.trend === 'up' ? '&#8593;' : '&#8595;'); // Up/Down arrow
        } {
          node.trendText = '';
        }

        lastTotalCurrentPower += node.lastReportedValue;
        lastTotalCurrentPower = (lastTotalCurrentPower.toFixed(1))/1;

        return node;
      }

      function scopeUpdate(scope, updatedRawScope) {

        angular.extend(scope, {
          lastReportedTime: (new Date(updatedRawScope.lastReportedTime)).valueOf(),
          lastReportedValue: updatedRawScope.lastReportedValue.toFixed(1) / 1,
          percent: updatedRawScope.percent,
          totalEnergyGenerated: Math.round(updatedRawScope.totalEnergyGenerated),
          trend: updatedRawScope.trend
        });

        if (scope.trend) {
          scope.trendText = $sce.trustAsHtml(scope.trend === 'up' ? '&#8593;' : '&#8595;'); // Up/Down arrow
        } {
          scope.trendText = '';
        }

        scope.lastReportedValue = 0;
        angular.forEach(scope.nodes, function (node) {
          var updatedRawNode = updatedRawScope.nodes[node.nodeId];
          if (!updatedRawNode) { return; }

          nodeUpdate(node, updatedRawNode);

          // Calculate scope's CP from child Node's CP
          scope.lastReportedValue += node.lastReportedValue;
          scope.lastReportedValue = (scope.lastReportedValue.toFixed(1))/1;
        });

        return scope;
      }

      function facilityUpdate(facility, updatedRawFacility) {

        angular.extend(facility, {
          lastReportedTime: (new Date(updatedRawFacility.lastReportedTime)).valueOf(),
          lastReportedValue: updatedRawFacility.lastReportedValue.toFixed(1) / 1,
          percent: updatedRawFacility.percent,
          totalEnergyGenerated: Math.round(updatedRawFacility.totalEnergyGenerated),
          trend: updatedRawFacility.trend
        });

        if (facility.trend) {
          facility.trendText = $sce.trustAsHtml(facility.trend === 'up' ? '&#8593;' : '&#8595;'); // Up/Down arrow
        } {
          facility.trendText = '';
        }

        if (lastReportedDateTime < facility.lastReportedTime) {
          lastReportedDateTime = facility.lastReportedTime;
        }

        facility.lastReportedValue = 0;
        angular.forEach(facility.scopes, function (scope) {
          var updatedRawScope = updatedRawFacility.scopes[scope.id];
          if (!updatedRawScope) { return; }

          scopeUpdate(scope, updatedRawScope);

          // Calculate scope's CP from child Node's CP
          facility.lastReportedValue += scope.lastReportedValue;
          facility.lastReportedValue = (facility.lastReportedValue.toFixed(1))/1;
        });
        return facility;
      }

      this.getAll = function () {

        facilityList = $window.renderSolarTags.facilities.map(facilityInit);

        return $q.when(facilityList);
      };

      this.watchAllSolarTags = function (callback, notWantTags) {
        SocketIO.watch('assurf:sources', function(sources) {
          if (notWantTags) {
            return callback(true);
          }

          lastTotalCurrentPower = 0;

          facilityList.map(function (facility) {
            var updatedRawFacility = sources[facility.id];
            if (!updatedRawFacility) { return facility; }
            return facilityUpdate(facility, updatedRawFacility);
          });

          $rootScope.LAST_UPDATED_TIMETIME = lastReportedDateTime;

          callback(facilityList);
        });
      };

      this.getSourceDetail = function (sourceId) {
        if (!sourceId) {
          return false;
        }

        for(var idx=0,len=facilityList.length; idx<len; idx++) {
          var scopes = facilityList[idx].scopes;

          if (facilityList[idx].id === sourceId) {
            return facilityList[idx];
          }

          for(var jdx=0,slen=scopes.length;jdx<slen;jdx++) {
            if (scopes[jdx].id === sourceId) {
              return scopes[jdx];
            }
          }
        }
      };

      this.getLastReportedDateTime = function () {
        return lastReportedDateTime;
      };

      this.getLastTotalCurrentPower = function () {
        return lastTotalCurrentPower;
      };

      this.getLastUpdatedFacilityList = function () {
        return facilityList;
      };

      function getPowerChart(rawPowerChart) {
        var categories;

        // Convert date string to timestamp in User timezone;
        categories = rawPowerChart.categories.map(function (originalDate) {
          return (new Date(originalDate)).valueOf();
        });

        return {
          'categories': categories,
          'series': rawPowerChart.series
        };
      }

      function getEnergyChart(rawEnergyChart) {
        var categories, series;

        // Convert date string to timestamp in User timezone;
        categories = rawEnergyChart.categories.map(function (originalDate) {
          return (new Date(originalDate)).valueOf();
        });

        series = rawEnergyChart.series.map(function (item) {
          return [item[2], item[3], item[4], item[5]];
        });

        return {
          'categories': categories,
          'series': series,
          'totalProduction': rawEnergyChart.totalProduction,
          'year': rawEnergyChart.year
        };
      }

      this.getFacilityDrilldown = function (callback) {
        return SocketIO.watch('assurf:facilitydrilldown', function(rawFD) {
          lastFacilityDrilldown = {
            energyChart: getEnergyChart(rawFD.energyChart),
            powerChart: getPowerChart(rawFD.powerChart),
            predictedAnnualGeneration: rawFD.predictedAnnualGeneration,
            predictedAnnualCarbon: rawFD.predictedCarbonAvoided,
            facilityImage: rawFD.facilityImage
          };

          callback(lastFacilityDrilldown);
        });
      };

      this.unwatchFacilityDrilldown = function (cbUniqueId) {
        SocketIO.unwatch('assurf:facilitydrilldown', cbUniqueId);
      };

      this.emitFetchFacilityForDrilldown = function (facilityId, energyYear) {
        var data = {
          'inspectedFacility': facilityId,
          'energyYear': energyYear || (new Date()).getFullYear()
        };

        SocketIO.emit('assurf:inputfacilitydrilldown', data);
      };
    }
  ]);
angular.module('bl.analyze.solar.surface')

.factory('SocketIO', ['$rootScope', '$q', '$timeout',  'toastrConfig', 'toastr',
      'socketFactory', 'wsEntryPoint', 'wsConfig', 'firstLoadEventList',
  function ($rootScope, $q, $timeout, toastrConfig, toastr, socketFactory, wsEntryPoint, wsConfig, firstLoadEventList) {
    var myIoSocket, mySocket, mySocketId;
    var initialLoadEvent = angular.copy(firstLoadEventList);
    var defer = $q.defer();
    var watchCallbacks = {};
    var cbUniqueId = -1;

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

    // Remove assurf:viewertzoffset from socket-io.js
    /*function emitClientTimezoneToServer (socketId) {
      var eventName = 'assurf:viewertzoffset',
        requestData = {
          viewerTZOffset: new Date().getTimezoneOffset() * -1
        };

      console.log('Socket Request on [%s] channel:', eventName, requestData);
      sendRequest(eventName, requestData, socketId);
    }*/

    // Get Socket ID;
    mySocket.on('connected', function (data) {
      data = decompressResponse(data);

      if (data.socketId) {
        mySocketId = data.socketId;
        console.log('SocketIO get socketId:', mySocketId);


        // Send client timezone to server as soon as Socket is connected
        // Remove assurf:viewertzoffset from socket-io.js
        //emitClientTimezoneToServer(mySocketId);

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
          sendRequest(eventName, data, mySocketId);
        } else {
          defer.promise.then(function (socketId) {
            sendRequest(eventName, data, socketId);
          });
        }
      },
      watch: function (eventName, callback) {
        cbUniqueId++;
        if (watchCallbacks[eventName] && Object.keys(watchCallbacks[eventName]).length) {
          watchCallbacks[eventName][cbUniqueId] = callback;
          return cbUniqueId;
        } else {
          watchCallbacks[eventName] = {};
          watchCallbacks[eventName][cbUniqueId] = callback;
        }

        mySocket.on(eventName, function (data) {
          data = decompressResponse(data);
          console.log('Socket Response on [%s] channel:',eventName, data);

          angular.element(document.querySelector('#toast-container')).html('');
          angular.element(document.querySelector('#loading-welcome-msg small')).css('display', '');
          toastrConfig.timeOut = 0;
          toastrConfig.extendedTimeOut = 0;
          toastrConfig.allowHtml = true;
          toastrConfig.positionClass = 'toast-bottom-full-width';
          toastrConfig.autoDismiss = true;
          toastrConfig.maxOpened = 1;
          toastrConfig.tapToDismiss = false;

          if (!data.success){
            console.log('Socket Channel[%s] Error: %s', eventName, data.message);
            $timeout(function() {
              angular.element(document.querySelector('#loading-welcome-msg small')).css('display', 'none');
              toastr.error('<b>Critical Error</b>: There was an error retrieving your data.' +
                ' Your BrighterLink support team is aware of the issue and is working hard to resolve it.' +
                '<span class="toastr-refresh">' +
                '<a href="mailto:services@brightergy.com">Let us know about this.</a> &nbsp;' +
                '<a href="javascript:location.reload();">' +
                '<img src="dist/img/reload_icon.png" width="15" height="13"/>' +
                '</a></span>', '', {
                iconClass: 'toastr-icon-error'
              });
            }, 0);
            return;
          }

          $rootScope.$apply(function () {
            countInitialLoadEvent(eventName);
            angular.forEach(watchCallbacks[eventName], function (callback) {
              callback.call(mySocket, data.message);
            });
          });
        });

        return cbUniqueId;
      },
      unwatch: function (eventName, cbUniqueId) {
        if (typeof watchCallbacks[eventName] === 'object'
          && Object.keys(watchCallbacks[eventName]).indexOf(cbUniqueId) > -1) {
          delete watchCallbacks[eventName][cbUniqueId];
          return;
        }

        watchCallbacks[eventName] = undefined;
        mySocket.removeAllListeners(eventName);
      },
      removeAllListeners: function () {
        mySocket.removeAllListeners();
      }
    };
  }
]);
angular.module('bl.analyze.solar.surface')
  .service('savingService', ['$filter', 'SocketIO', 'moment', 'solarTagService',
    function ($filter, SocketIO, moment, solarTagService) {
    var lastSaving, lastSavingTable;

    function getKPIfromSaving (raw) {
      var totalProductionBySources = [];
      angular.forEach(raw.totalProductionBySources, function (production, sourceId) {
        var sourceDetail = solarTagService.getSourceDetail(sourceId);
        totalProductionBySources.push({
          name: sourceDetail.name,
          displayName: sourceDetail.displayName,
          color: sourceDetail.color || '#000',
          sourceId: production.sourceId,
          kwh: production.kwh
        });
      });

      return {
        totalSavingPerDateRange: Math.round(raw.totalSavingPerDateRange),
        totalSavings: $filter('number')(raw.totalSavings, 2),
        totalProductionBySources: totalProductionBySources,
        totalProduction: raw.totalProduction
      };
    }

    function getAreachartFromSaving (rawAreaChart) {
      return {
        'series': rawAreaChart.series.map(function (serie) {
          var sourceDetail = solarTagService.getSourceDetail(serie.sourceId);

          return angular.extend(serie, {
            name: sourceDetail.displayName || serie.name,
            color: sourceDetail.color || randomColor({luminosity: 'dark'})
          });
        }),
        'categories': rawAreaChart.categories.map(function (date) {
          return (new Date(date)).valueOf();
        })
      };
    }

    function getCombochartFromSaving (rawComboChart) {
      return {
        'series': rawComboChart.series,
        'categories': rawComboChart.categories.map(function (date) {
          return (new Date(date)).valueOf();
        })
      };
    }

    function getSavingTable(rawTable) {

      return rawTable.table.map(function (row) {
        return {
          'date': (new Date(row.date)).valueOf(),
          'percent': Math.round(row.percent),
          'sources': row.sources,
          'totalPerPeriod': row.totalPerPeriod
        };
      });
    }

    this.watch = function (callback) {
      SocketIO.watch('assurf:savings', function (savings) {

        lastSaving = {
          areaChart: getAreachartFromSaving(savings.areaChart),
          comboChart: getCombochartFromSaving(savings.comboChart),
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
      if (lastSavingTable) {
        callback(lastSavingTable);
      }

      SocketIO.watch('assurf:table', function (table) {
        lastSavingTable = getSavingTable(table);
        callback(lastSavingTable);
      });
      return this;
    };
  }]);
angular.module('bl.analyze.solar.surface')
  .service('powerService', ['$q', '$filter', '$sce', 'SocketIO', 'moment', 'solarTagService',
    function($q, $filter, $sce, SocketIO, moment, solarTagService) {
      var lastRTPInfo, lastCurrentPowerInfo;

      function getKPIFromRTP(rawRTP) {
        var productionBySources = [],
            totalPowerGeneration = 0;

        angular.forEach(rawRTP.generationBySources, function (generation, sourceId) {
          var sourceDetail = solarTagService.getSourceDetail(sourceId);
          productionBySources.push({
            'sourceId': generation.sourceId,
            'displayName': sourceDetail.displayName,
            'name': generation.name,
            'kw': (generation.kw.toFixed(1))/1,
            'trend': generation.trend,
            'color': sourceDetail.color || '#000'
          });

          totalPowerGeneration += (generation.kw.toFixed(1))/1;
        });

        return {
          'totalPowerGeneration': totalPowerGeneration.toFixed(1),
          'totalPowerGenerationTrend': rawRTP.totalGeneration.trend,
          'generationBySources': $filter('orderBy')(productionBySources, '+displayName')
        };
      }

      function getPrimaryFromRTP(rawRTP) {
        var xaxis, datapoints;

        // Convert date string to timestamp in User timezone;
        xaxis = rawRTP.mainChart.categories.map(function (originalDate) {
          return (new Date(originalDate)).valueOf();
        });

        // Insert the serie color from source detail
        datapoints = rawRTP.mainChart.series.map(function (serie) {
          var sourceDetail = solarTagService.getSourceDetail(serie.sourceId);

          if (sourceDetail) {
            serie.displayName = sourceDetail.displayName;
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

      function pullLastPowerFromTags (rtpInfo) {

        // KPI update
        rtpInfo.kpiData.generationBySources = rtpInfo.kpiData.generationBySources.map(function (generation) {
          var sourceDetail = solarTagService.getSourceDetail(generation.sourceId);
          generation.kw = sourceDetail.lastReportedValue;
          return generation;
        });

        rtpInfo.kpiData.totalPowerGeneration = solarTagService.getLastTotalCurrentPower();

        // Primary Chart update

        rtpInfo.primary.datapoints = rtpInfo.primary.datapoints.map( function (datapoint) {
          if (datapoint.sourceId) {
            var sourceDetail = solarTagService.getSourceDetail(datapoint.sourceId);
            datapoint.data[datapoint.data.length - 1] = sourceDetail.lastReportedValue;
          } else {
            datapoint.data[datapoint.data.length - 1] = rtpInfo.kpiData.totalPowerGeneration;
          }
          return datapoint;
        });

        return rtpInfo;
      }

      this.pullLastPowerFromTags = pullLastPowerFromTags;

      this.watchRTPower = function (callback) {

        SocketIO.watch('assurf:realtimepower', function (data) {
          lastRTPInfo = {
            'history': !!data.history,
            'kpiData': data.totalGeneration ? getKPIFromRTP(data) : null,
            'primary': data.mainChart ? getPrimaryFromRTP(data) : null
          };

          if (data.dateRange === 'today'
            && lastRTPInfo.kpiData && lastRTPInfo.primary
            && solarTagService.getLastReportedDateTime()) {
            callback(pullLastPowerFromTags(lastRTPInfo));
          } else {
            callback(lastRTPInfo);
          }

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

          var lastPowerSumOfSelectedNodes = solarTagService.getLastTotalCurrentPower();
          if (lastPowerSumOfSelectedNodes >= 0) {
            lastCurrentPowerInfo.current = lastPowerSumOfSelectedNodes;
          }

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
angular.module('bl.analyze.solar.surface')
  .service('kmService', ['$window', function ($window) {
      this.trackEvent = function(type, action, contentObj) {
        $window._kmq.push([type, action, contentObj]);
      };
    }
  ]);
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
angular.module('bl.analyze.solar.surface')
  .service('energyService', ['$q', '$filter', 'SocketIO', 'moment', 'solarTagService',
    function($q, $filter, SocketIO, moment, solarTagService) {
      var lastCurrentEnergy, lastTodayEnergyDrilldown, lastTEG, lastAvPE, lastSEG, lastSEGDrilldown, lastYield;

      function getKPIFromTEDrilldown(rawData) {
        var energyBySources  = [];

        angular.forEach(rawData.totalProductionBySources, function (production) {
          var sourceDetail = solarTagService.getSourceDetail(production.sourceId);
          energyBySources.push({
            'name': sourceDetail.name,
            'displayName': sourceDetail.displayName,
            'color': sourceDetail ? sourceDetail.color: '#000',
            'kwh': production.kwh
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
            (new Date(datetime)).valueOf(),
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
                name: 'Energy Produced',
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

      this.watchAvPE = function (callback) {
        SocketIO.watch('assurf:actualpredictedenergy', function (avpeData) {
          lastAvPE = avpeData;
          callback(lastAvPE);
        });
      };

      this.emitAvPE = function (dateRange) {
        var data = {
          'dateRange': dateRange || 'month'
        };
        SocketIO.emit('assurf:inputactualpredictedenergy', data);
      };

      function getKPIFromSEG(rawSEG) {
        var totalProductionBySources = [];

        angular.forEach(rawSEG.totalProductionBySources, function (production, sourceId) {
          var sourceDetail = solarTagService.getSourceDetail(sourceId);

          totalProductionBySources.push({
            'displayName': sourceDetail.displayName,
            'name': sourceDetail.name,
            'kwh': Math.round(production.kwh),
            'color': sourceDetail.color || '#000'
          });
        });

        return {
          'totalProduction': Math.round(rawSEG.totalProduction),
          'totalSaving': Math.round(rawSEG.totalSaving * 100) / 100,
          'totalProductionBySources': $filter('orderBy')(totalProductionBySources, '+displayName')
        };
      }

      function getPrimaryFromSEG(rawSEGMain) {
        var xaxis,
          datapoints;

        // Convert date string to timestamp in User timezone;
        xaxis = rawSEGMain.categories.map(function (originalDate) {
          return (new Date(originalDate)).valueOf();
        });

        // Insert the serie color from source detail
        datapoints = rawSEGMain.series.map(function (serie) {

          if (serie.sourceId) {
            var sourceDetail = solarTagService.getSourceDetail(serie.sourceId);
            serie.displayName = sourceDetail.displayName;
            serie.color = sourceDetail.color || '#000';
          } else if (serie.name === 'Total Generation') {
            // $brand-primary color;
            serie.color = '#e16030';
          }

          return serie;
        });

        return {
          'categories': xaxis,
          'series': datapoints
        };
      }

      function getPieFromSEG(rawSEGPie) {
        var series = angular.copy(rawSEGPie.series);

        series[0].data = series[0].data.map(function (data) {
          var sourceDetail = solarTagService.getSourceDetail(data.sourceId);
          return sourceDetail ? [sourceDetail.displayName, data.percent, sourceDetail.color]
                              : [data.name, data.percent, randomColor({luminosity: 'dark'})];
        });

        return {
          series: series
        };
      }

      function getCandleFromSEG(rawSEG) {
        var series = rawSEG.candlestick.series;
        return {
          series: series
        };
      }

      this.watchSEG = function (callback) {
        SocketIO.watch('assurf:solarenergygeneration', function(rawSEG) {

          lastSEG = {
            'dateRange': rawSEG.dateRange,
            'kpiData': getKPIFromSEG(rawSEG),
            'primary': getPrimaryFromSEG(rawSEG.mainChart),
            'pie':  getPieFromSEG(rawSEG.pie)
          };

          callback(lastSEG);
        });
        return this;
      };

      this.emitSEG = function (requestData) {
        SocketIO.emit('assurf:getsolarenergygeneration', requestData);
      };

      this.watchSEGDrilldown = function (callback) {
        if (lastSEGDrilldown) {
          callback(lastSEGDrilldown);
        }

        SocketIO.watch('assurf:solarenergygenerationdrilldown', function (rawSEGDrilldown) {
          lastSEGDrilldown = {
            'kpiData': getKPIFromSEG(rawSEGDrilldown),
            'candlestick': getCandleFromSEG(rawSEGDrilldown)
          };
          callback(lastSEGDrilldown);
        });
        return this;
      };

      function getYTDFromMonthlySerie (serie) {
        var YTD = [];
        for (var idx = 0; idx < serie.data.length; idx++) {
          if (!YTD.length) {
            YTD.push(serie.data[idx]);
          } else {
            YTD.push(YTD[idx -1] + serie.data[idx]);
          }
        }
        return YTD;
      }

      function getSerieFromYield (rawYield) {
        return {
          'currentKWh': rawYield[0],
          'current$': rawYield[1],
          'previousKWh': rawYield[2],
          'previous$': rawYield[3],
          'averageKWh': rawYield[4],
          'currentKWhYTD': {data: getYTDFromMonthlySerie(rawYield[0])},
          'current$YTD': {data:getYTDFromMonthlySerie(rawYield[1])},
          'previousKWhYTD': {data:getYTDFromMonthlySerie(rawYield[2])},
          'previous$YTD': {data:getYTDFromMonthlySerie(rawYield[3])}
        };
      }

      this.watchYieldComparison = function (callback) {
        SocketIO.watch('assurf:yieldcomparator', function (rawYield) {
          lastYield = {
            categories: rawYield.category.map(function (category) {
              return category.split('T')[0];
            }),
            series: getSerieFromYield (rawYield.series)
          };

          callback(lastYield);
        });
      };
    }
  ]);

angular.module('bl.analyze.solar.surface')
.factory('SourceNotification',['$timeout',
  function ($timeout) {

    /**
     *
     * @param targetSelector {string}
     * @constructor
     */
    function SourceNotify (targetSelector) {
      var message = 'You must have at least one source selected';
      this.targetSelector = targetSelector;
      this.$handle = $('<div class="source-notify">'
        + '<div class="source-notify-arrow"></div><div class="source-notify-icon"></div>'
        + '<div class="source-notify-message">' + message + '</div></div>');
    }

    SourceNotify.prototype.showNotification = function () {
      if ($('.source-notify').length) {
        return false;
      }

      var offset = $(this.targetSelector).parents('li').offset(),
        left = offset.left - 12,
        top = offset.top - $(window).scrollTop() - 60,
        handle = this.$handle;

      $(document.body).append(handle);

      $(handle).css({left: left, top: top});
      handle.fadeIn(200);
      $timeout(function() {
        handle.fadeOut(400, function() {
          handle.remove();
        });
      }, 3200, false);
    };

    return SourceNotify;
  }]);
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
angular.module('bl.analyze.solar.surface')
  .filter('asDecimalUnitPrefix', function () {
    return function(number, afterfix, base) {

      var prefix = base === 'k' ? 1 : 0;
      var prefixes = ['', 'k', 'M', 'G', 'T'];  //kilo, mega, giga, tera;


      if (number >= 1000000000000) {
        prefix += 4;
      } else if (number >= 1000000000) {
        prefix += 3;
      } else if (number >= 1000000) {
        prefix += 2;
      } else if (number >= 1000) {
        prefix += 1;
      }

      return prefixes[prefix] + (afterfix || '');
    };
  });
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
angular.module('bl.analyze.solar.surface')
  .directive('asTooltip', function () {
    var addToolTip = function (scope, element, attrs) {
      var position = attrs['tooltipPosition'] || 'bottom left',
        classes = attrs['tooltipClasses'] || '',
        contentDom = attrs['tooltipContentDom'] || '';

      classes += ' drop-theme-arrows';
      if (!contentDom && !scope.contentString) {
        console.log('Error in asTooltip directive: as-tooltip value is missing');
        return;
      }
      var content = contentDom
        ? document.querySelector(contentDom)
        : function () { return scope.contentString; };

      return new Drop({
        target: element[0],
        classes: classes,
        content: content,
        position: position,
        openOn: 'hover',
        constrainToWindow: true,
        remove: true,
        tetherOptions: {
          constraints: [{
            to: 'window',
            pin: true,
            attachment: 'together'
          }]
        }
      });
    };

    return {
      restrict: 'A',
      scope: {
        contentString: '=tooltipText'
      },
      compile: function (element) {
        element.addClass('has-tooltip');

        return addToolTip;
      }
    };
  });

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
      }
    };
  });
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
          if (inputWrapper.hasClass('extend') && !inputWrapper.find('input').val()) {
            inputWrapper.find('input').focus();
          }
          e.preventDefault();
        });

        $(element).on('blur', 'input', function (e) {
          if ($(e.relatedTarget).hasClass('sp-source-submit') || e.currentTarget.value) {
            return ;
          }

          $(element)
            .find('.sp-search-input-wrapper').removeClass('extend');
        });
      }
    };
  });
angular.module('bl.analyze.solar.surface')
  .constant('mobileWidth', 767)
  .directive('asSpListScrollBar',
    ['$rootScope', '$window', '$position', 'mobileWidth',
    function ($rootScope, $window, $position, mobileWidth) {
      var setCustomScrollBar = function (element, height) {
        $(element).mCustomScrollbar({
          axis: 'y',
          theme: 'light',
          setHeight: height,
          callbacks: {
            whileScrolling: function() {
              var tooltipWrappers = $(element).find('.drop-enabled[as-tooltip]');
              for (var idx = 0; idx < tooltipWrappers.length; idx++) {
                $(tooltipWrappers[idx]).data('dropBox').close();
              }
            }
          }
        });
      };

      // It should return the height of visible part of element.
      var getHeightOfViewport = function (element) {
        var totalHeight = $window.innerHeight;

        var elementOffset = /*$position.offset(element);*/$(element).position();
        return totalHeight - elementOffset.top; //;
      };

      var getHeightOfTable = function () {
        var totalHeight = $(window).height() + $(window).scrollTop();
        
        var elementOffsetTop = 500; // offset top of table
        return totalHeight - elementOffsetTop - 10;
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
angular.module('bl.analyze.solar.surface')
.directive('asNavPopup', ['$document', '$timeout',
  function ($document, $timeout) {
    var transitionMS = 150;
    $document = $($document);

    function hidePopUp ($element, $popupContainer) {
      $popupContainer.removeClass('in');
      $timeout(function () {
        $popupContainer.addClass('hide');
      }, transitionMS, false);

      $document
        .off('click.nav-popup-close' + $element.elementId)
        .off('keydown.nav-popup-close' + $element.elementId);
    }

    function bindAutoCloseEvents ($element, $popupContainer) {
      $document
        //.on('click.nav-popup-close', hidePopUp.bind
        .on('click.nav-popup-close' + $element.elementId, function (e) {
          if (e.target !== $element.find('.icon-popup-grip')[0]) {
            hidePopUp($element, $popupContainer);
          }
        })
        .on('keydown.nav-popup-close' + $element.elementId, function (e) {
          if (e.keyCode === 27) { // ESCAPE key pressed
            hidePopUp($element, $popupContainer);
          }
        });
    }

    function showPopUp ($element, $popupContainer) {
      $popupContainer.removeClass('hide').addClass('in');
      bindAutoCloseEvents($element, $popupContainer);
    }

    function bindClickEvent ($element, $popupContainer) {
      $element.on('click.nav-popup', '.icon-popup-grip', function () {
        //$animate.addClass('popup-show', $popupContainer);
        showPopUp($element, $popupContainer);
      });
    }

    return {
      restrict: 'EA',
      scope: false,
      template: [
        '<a class="icon-popup-grip" aria-haspopup="true" aria-expanded="false"></a>',
        '<div class="nav-popup-container fade hide"><div class="nav-popup-content" ng-transclude></div></div>'
      ].join(''),
      transclude: true,
      link: function (scope, element) {
        var $element = $(element),
          elementId = (new Date()).valueOf(),
          $popupContainer = $(element).find('.nav-popup-container');
        // Event bindings
        $element['elementId'] = elementId;
        bindClickEvent($element, $popupContainer);
      }
    };
  }
]);

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
          $(element).hide();
          $document.prop('title', originDocumentTitle);
        }, config.animationDuration, false);
      }, config.animationDelay, false);
    };

    var changeTitle = function (percentage) {
      /*$timeout(function () {*/
        $document.prop('title', percentage + '% Loaded');
      /*}, 60);*/
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
            $(element)
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

angular.module('bl.analyze.solar.surface')
  .constant('asElementShowLoadingConfig', {
    animationDelay: 150
  })
  .directive('asElementShowLoading', ['$timeout', 'asElementShowLoadingConfig',
    function($timeout, config) {
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
            }, config.animationDelay, false);
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
   }
  ]
)

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

angular.module('bl.analyze.solar.surface')
  .directive('asDaterangePicker',
  ['moment', function(moment) {
    return {
      restrict: 'EA',
      replace: true,
      transclude: false,
      scope: {
        startDate: '=',
        endDate: '='
      },
      template: ['<div class="date-range-picker">',
        '<div class="date-el-wrapper">',
        '<span class="dateLabel">From:</span>',
        '<span class="dateValue" ng-bind="startDate | amDateFormat:\'M/DD/YYYY\'"></span>',
        '</div>',
        '<div class="date-el-wrapper">',
        '<span class="dateLabel">To:</span>',
        '<span class="dateValue" ng-bind="endDate | amDateFormat:\'M/DD/YYYY\'"></span>',
        '</div>',
        '</div>'].join(''),
      link: function(scope, element, attrs) {
        var id = attrs.id;
        var dateFormat = 'M/DD/YYYY',
          today = moment().format('M/DD/YYYY');

        $(element).find('.dateValue').dateRangePicker({
          format: dateFormat,
          separator : '-',
          container: '#' + id,
          showShortcuts: false,
          autoClose: true,
          startOfWeek: 'monday',
          endDate: today,
          getValue: function() {
            if (scope.startDate && scope.endDate ) {
              return [moment(scope.startDate).format(dateFormat),
                moment(scope.endDate).format(dateFormat)].join('-');
            } else {
              return '';
            }
          },
          setValue: function(s, s1, s2) {
            var startDate = moment(s1, dateFormat).valueOf(),
              endDate = moment(s2, dateFormat).valueOf();

            if (startDate !== scope.startDate && endDate !== scope.endDate) {
              scope.startDate = moment(s1, dateFormat).valueOf();
              scope.endDate = moment(s2, dateFormat).valueOf();
              scope.$apply();
            }
          }
        });
      }
    };
  }]);
angular.module('bl.analyze.solar.surface')
  .directive('asCurrentTime', ['$filter', '$timeout', function($filter, $timeout){
    return function(scope, element, attrs){
      var format = attrs.format,
          isCapitalWeekDay = attrs.capitalweek || false;

      function updateTime(){
        var dt = $filter(isCapitalWeekDay ? 'asDate' : 'date')(new Date(), format);
        element.text(dt);
      }

      function updateLater() {
        $timeout(function() {
          updateTime(); // update DOM
          updateLater(); // schedule another update
        }, 1000, false);
      }
      updateTime();
      updateLater();
    };
  }]);
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
          if ((attrs.numDecimals !== null) && attrs.numDecimals >= 0) {
            numDecimals = attrs.numDecimals;
          } else {
            numDecimals = 0;
          }
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
            if (oldVal <= 0) {
              if (newVal >= 1000) {
                var firstVal = Number(String(newVal).charAt(0));
                oldVal = newVal / firstVal;
              }
            }
            return new countUp(element[0], oldVal, newVal, numDecimals, animationLength, option).start();
          }
        });
      }
    };
  });

angular.module('bl.analyze.solar.surface')
  .controller('SelectionPanelController',
  ['$scope', '$modal', '$filter', 'solarTagService', 'powerService', 'energyService', 'weatherService',
    'SourceSelectionEventService', 'SourceNotification', 'kmService',
    function ($scope, $modal, $filter, solarTagService, powerService, energyService, weatherService,
              SourceSelectionEventService, SourceNotification, kmService) {
      // Init scope variables
      $scope.powerInfo = {
        current: -1,
        currentDayAvg: 0.5,
        minAvg: 0,
        maxAvg: 1,
        potential: 0
      };

      $scope.energyInfo = {
        today: 0,
        utilitySavingToday: 0,
        utilitySavingMonth: 0,
        minAvg: 5,
        maxAvg: 30
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

      $scope.foreWeather = [];
      $scope.historicalWeather = [];

      $scope.facilities = [];
      $scope.selectedFacilities = [];
      $scope.selectedScopes = [];
      $scope.selectedNodes = [];
      $scope.countNodes = 0;
      $scope.isSourceListLoaded = false;
      $scope.isSelectAll = true;
      $scope.isMainStageLoaded = false;
      $scope.isWeatherHistoryShown = false;

      $scope.prevModalInstance = null;

      $scope.toggleWeatherHistory = function () {
        $scope.isWeatherHistoryShown = !$scope.isWeatherHistoryShown;
      };

      $scope.loadFacilityList = function (newFacilityList) {

        var lastPowerSumOfSelectedNodes = solarTagService.getLastTotalCurrentPower();
        if (lastPowerSumOfSelectedNodes >= 0) {
          $scope.powerInfo.current = lastPowerSumOfSelectedNodes;
        }

        $scope.powerInfo.potential = 0;
        angular.forEach(newFacilityList, function (facility) {
          if (facility.selected) {
            $scope.powerInfo.potential += facility.potentialPower;
          }
        });

        $scope.facilities = $filter('orderBy')(newFacilityList, ['-selected', '+displayName']);
        $scope.isSourceListLoaded = true;
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

      $scope.initLoads = function () {
        solarTagService
          .getAll()
          .then(function (facilities) {
            angular.forEach(facilities, function (facility) {
              $scope.countNodes += facility.nodesCount;//facility.scopes.length;
              $scope.countScopes += facility.scopes.length;
              $scope.isSelectAll = $scope.isSelectAll && facility.selected;
            });
            return facilities;
          })
          .then(function (facilities) {
            checkSourcesSelectedStatus(facilities);
            $scope.loadFacilityList(facilities);
            solarTagService.watchAllSolarTags($scope.loadFacilityList);
            $scope.getSelectedSources();
            return true;
          });

        powerService
          .watchCurrentPower(function (data) {
            console.log('currentPower info:', data);
            // We will use `assurf:power` for the first time only
            // after that we will show total sum of power from `assurf:sources` for the Current Power kpi
            if ($scope.powerInfo.current < 0) {
              angular.extend($scope.powerInfo, data);
            }
          });

        energyService
          .watchCurrentEnergy(function (data) {
            console.log('currentEnergy info:', data);
            angular.extend($scope.energyInfo, data);
          });

        weatherService
          .watchWeather(function (data) {
            $scope.todayWeather = data.todayWeather;
            $scope.historicalWeather = data.historicalWeather;
            $scope.foreWeather = data.foreWeather;
          });

        SourceSelectionEventService
          .listenMainStageLoaded(function () {
            $scope.isMainStageLoaded = true;
          });
      };

      $scope.showFacilityDetails = function (selectedFacility) {
        if ($scope.prevModalInstance) {
          $scope.prevModalInstance.dismiss('cancel');
        }

        $scope.prevModalInstance = $modal.open({
          templateUrl: 'app/partials/facility-details.html',
          controller: 'facilityDetailsController',
          windowClass: 'drilldown',
          size: 'lg',
          resolve: {
            selectedFacility: function () {
              return selectedFacility;
            }
          }
        });

        solarTagService.emitFetchFacilityForDrilldown(selectedFacility.id);

        //Kissmetrics tracking
        var contentObj = {'Display Name':selectedFacility.displayName};
        kmService.trackEvent('record', 'Visited Facility Detail', contentObj);
      };

      $scope.toggleSelectSource = function (source, sourceType, $rootScope) {
        // Todo: Prevent user from deselect all sources
        var toggledStatus = source.selected;
        var targetSelector = '';

        if (!toggledStatus) { // when user is going to deselect the all sources
          if (sourceType === 'facility') {
            if ($scope.selectedFacilities.length - 1 === 0) {
              source.selected = !source.selected;   // restore origin status

              //alert('Sorry, but you can\'t deselect whole sources.');
              targetSelector = '#' + sourceType + '-' + source.id;
              (new SourceNotification(targetSelector)).showNotification();

              return;
            }
          } else {
            var countNodesGoingToBeDeselected = source.nodes ? source.nodes.length : 1;
            if ($scope.selectedNodes.length - countNodesGoingToBeDeselected  === 0) {
              source.selected = !source.selected;   // restore origin status

              //alert('Sorry, but you can\'t deselect whole sources.');
              targetSelector = '#' + sourceType + '-' + source.id;
              (new SourceNotification(targetSelector)).showNotification();

              return;
            }
          }
        }

        setSourceSelectionRecursively(source, toggledStatus);
        checkSourcesSelectedStatus($scope.facilities);

        $scope.getSelectedSources();
        $scope.facilities = $filter('orderBy')($scope.facilities, ['-selected', '+displayName']);

        if (sourceType !== 'node') {
          if (source.selected) {
            $scope.powerInfo.potential += source.potentialPower;
          } else {
            $scope.powerInfo.potential -= source.potentialPower;
          }
        }

        $scope.isSourceListLoaded = false;
        $scope.isMainStageLoaded = false;

        SourceSelectionEventService
          .broadcast($scope.selectedFacilities, $scope.selectedScopes, $scope.selectedNodes)
          .resetMainStageChecking();
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
        SourceSelectionEventService
          .broadcast($scope.selectedFacilities, $scope.selectedScopes, $scope.selectedNodes);
        $scope.isMainStageLoaded = false;
      };

      $scope.initLoads();
    }
  ]);
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
angular.module('bl.analyze.solar.surface')
  .controller('MainStageController', ['$scope',
    function ($scope) {
      //console.log('unknown:', Unknown);
      $scope.init = function () {
        console.log('Main Stage init');
      };
    }
  ]);
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
        			title: 'Value of Solar Energy Produced'
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
        			title: 'Produced vs Estimated'
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
              if ($scope.articleView === true)
              {
                  $scope.homeView = true;
                  $scope.articleView = false;
              }
              else
              {
                  $location.path('/main', false);
              }
          };

          $scope.goArticle = function() {
            $scope.articleView = true;
            $scope.homeView = false;
          };
        }
    ]);
angular.module('bl.analyze.solar.surface')
  .constant('fdChartConfigs', {
    'power': {
      title:{text:null}, credits: {enabled:false}, exporting:{enabled:false}, colors:['#ff7a41'],
      chart: {type:'areaspline', height:410, spacing:[0, 0, 0, 0], style:{width:'100%'}},
      tooltip:{
        valueSuffix:'kW', backgroundColor:'rgba(35,43,57,0.98)', borderRadius:3, borderWidth:0, shadow: false,
        shared: true,
        useHTML:true, lineWidth:1, crosshairs:{width:2, color:'gray', dashStyle:'shortdot'},
        style:{color:'#fff',padding: '0px'}
      },
      plotOptions: {
        series: {
          marker:{enabled:false}, states: {hover:{lineWidth: 1,lineWidthPlus: 0}}, lineWidth: 1,
          fillColor:{linearGradient:{x1:0,y1:0,x2:0,y2:1},
            stops : [
              [0, Highcharts.Color('#ff7a41').setOpacity(0.8).get('rgba')],
              [1, Highcharts.Color('#ff7a41').setOpacity(0.1).get('rgba')]
            ]
          }
        }
      },
      yAxis: {
        min:0, title:{text: null}, gridLineColor:'#cccccc', plotLines: [{value:0, width:1, color:'#808080'}],
        labels:{enabled: false}
      },
      loading: false
    },
    'energy': {
      chart: {
        marginBottom: 60, marginRight: 60, spacingLeft: 0, spacingRight: 0, reflow: true, panning: false,
        height: 300,
        style: { fontSize: '11px', overflow: 'visible' }
      },
      navigator : {enabled:false}, navigation : {buttonOptions:{enabled : false}}, scrollbar : {enabled:false},
      rangeSelector : { enabled : false }, loading: false, credits: { enabled: false }, title : { text: null },
      tooltip: {
        useHTML: true, borderColor: null, borderWidth: 0, borderRadius: 3, shadow: false,
        spacing: [0,0,0,0], backgroundColor: 'rgba(35, 43, 57, 0.98)', style: {padding: '0px', whiteSpace: 'normal'}
      },
      yAxis: {
        title: null, opposite: true, offset: 50, min: 0, labels: {format:'{value} kWh'}
      },
      plotOptions: {
        candlestick: {
          color: 'blue',
          upColor: 'red'
        }
      },
      xAxis: { startOnTick: true }
    }
  })
  /*.controller('facilityDetailsController', ['$scope', '$modalInstance', '$timeout', 'facilityDetailsService',
   function ($scope, $modalInstance, $timeout, facilityDetailsService) {*/
  .controller('facilityDetailsController',
  ['$scope', '$modalInstance', '$timeout', '$filter', '$interpolate', '$http',
    'moment', 'solarTagService', 'selectedFacility', 'fdChartConfigs', 'kmService',
    function ($scope, $modalInstance, $timeout, $filter, $interpolate, $http,
              moment, solarTagService, selectedFacility, fdChartConfigs, kmService) {
      var fdCallbackId;
      $scope.currentYear = $scope.selectedYear = moment().year();
      $scope.lastFacilityInfo = {
        'operator': 'Brightergy LLC',
        'predictedAnnualGeneration': 0,
        'predictedAnnualCarbon': 0,
        'description': '',
        'location': {
          availability: !!selectedFacility.latitude && !!selectedFacility.longitude,
          latitude: selectedFacility.latitude,
          longitude: selectedFacility.longitude
        },
        'address': selectedFacility.address,
        'installAddress': selectedFacility.installAddress,
        'potentialPower': selectedFacility.potentialPower,
        'commissioningDate': selectedFacility.commissioningDate === '-'
                            ? 'N/A'
                            : moment(selectedFacility.commissioningDate).format('MMMM D, YYYY')
      };

      $scope.isDataLoaded = false;
      $scope.isEnergyChartDataLoaded = false;
      $scope.isPowerChartDataLoaded = false;

      var tootipContents = $interpolate([
        '<div class="float-panel-info"><h5 class="title-energy">Energy Production for <br/> ',
        '{{currentDate|amDateFormat:"MMMM, YYYY"}} </h5>',
        '<div class="row"><div class="col-xs-6"<span>{{ initialDate }} :</span></div>',
        '<div class="col-xs-6 text-right"><span class="orange">{{ initialValue|number:2 }}kWh</span></div></div>',
        '<div class="row"><div class="col-xs-6"><span>Min Production :</span></div>',
        '<div class="col-xs-6 text-right"><span class="green">{{ minValue|number:2 }}kWh</span></div></div>',
        '<div class="row"><div class="col-xs-6"><span>Max Production :</span></div>',
        '<div class="col-xs-6 text-right"><span class="blue"> {{ maxValue|number:2 }}kWh</span></div></div>',
        '<div class="row"><div class="col-xs-6"><span>{{ finalDate }} :</span></div>',
        '<div class="col-xs-6 text-right"><span class="orange"> {{ finalValue|number:2 }}kWh</span></div></div>',
        '</div>'].join(''));

      $scope.powerChartConfig = {
        options: fdChartConfigs.power,
        xAxis: {
          llineColor: 'transparent', categories: [],
          labels:{formatter: function(){return $filter('amDateFormat')(this.value, 'MMM D');}}
        },
        series: [{ data: [] }],
        func: function (powerChartInstance) {
          $scope.powerChartInstance = powerChartInstance;
        }
      };

      $scope.powerChartConfig.options.tooltip.formatter = function () {
        var tooltipTxt = '<div class="float-panel-info">';
        tooltipTxt += '<h4 class="kpi">' + $filter('number')(this.points[0].y, 1) + ' kW</h4>';
        tooltipTxt += '<span>Power Generated on ' + $filter('amDateFormat')(this.x, 'MMM D') + '</span>';
        tooltipTxt += '</div>';
        return tooltipTxt;
      };

      $scope.energyChartInstance = null;
      $scope.powerChartInstance = null;

      $scope.energyChartConfig = {
        options: fdChartConfigs.energy, useHighStocks: true,
        xAxis: { labels: {formatter:function(){return moment(this.value).format('MMM');}} },
        series: [{
          type: 'candlestick',
          name: 'Energy',
          color: 'rgba(255, 121, 64, 0.9)',
          lineColor: 'rgba(254, 189, 159, 0.9)',
          upColor: 'rgba(254, 189, 159, 0.9)',
          states: {hover: {enabled: false}},
          dataGrouping: {enabled: false},
          data: []
        }],
        func: function (energyChartInstance) {
          $scope.energyChartInstance = energyChartInstance;
        }
      };

      $scope.energyChartConfig.options.tooltip.formatter = function () {
        return tootipContents({
          currentDate: this.x,
          initialDate: moment(this.x).startOf('month').format('MMMM Do'),
          initialValue: this.points[0].point.open,
          minValue: this.points[0].point.low,
          maxValue: this.points[0].point.high,
          finalDate: (moment(this.x).endOf('month').valueOf() < moment().valueOf()) ?
              moment(this.x).endOf('month').format('MMMM Do') : moment().format('MMMM Do'),
          finalValue: this.points[0].point.close
        });
      };

      $scope.startWatchFacilityDrilldown = function () {
        fdCallbackId = solarTagService.getFacilityDrilldown(function (fdData) {
          angular.extend($scope.lastFacilityInfo, fdData);
          //console.log($scope.lastFacilityInfo);
          $scope.drawChart();
          if (!$scope.lastFacilityInfo.location.availability) {
            $http.get('https://maps.googleapis.com/maps/api/geocode/json?address='
                + $scope.lastFacilityInfo.installAddress)
                .success(function(resp) {
                  $scope.lastFacilityInfo.location = {
                    'latitude': resp.results[0].geometry.location.lat,
                    'longitude': resp.results[0].geometry.location.lng,
                    'availability': true
                  };
                  $scope.drawMap();
                })
                .error(function(resp) {
                  $scope.lastFacilityInfo.location = {
                    'latitude': resp.results[0].geometry.location.lat,
                    'longitude': resp.results[0].geometry.location.lng,
                    'availability': true
                  };
                  $scope.drawMap();
                });
          }
          $scope.drawMap();
          $scope.isDataLoaded = true;
          $scope.isEnergyChartDataLoaded = true;
          $scope.isPowerChartDataLoaded = true;
        });
      };

      $scope.closeDrilldown = function () {
        solarTagService.unwatchFacilityDrilldown(fdCallbackId);
        $modalInstance.dismiss('cancel');
        //Kissmetrics tracking
        var contentObj = {'Display Name':selectedFacility.displayName};
        kmService.trackEvent('record', 'Closed Facility Detail', contentObj);
      };

      $scope.selectYear = function (year) {
        $scope.selectedYear = year;
        solarTagService.emitFetchFacilityForDrilldown(selectedFacility.id, $scope.selectedYear);
        $scope.isEnergyChartDataLoaded = false;
      };

      $scope.onPowerTabOpen = function () {
        $scope.isPowerChartDataLoaded = false;
        $timeout(function () {
          $scope.powerChartInstance.redraw();
          $scope.powerChartInstance.reflow();
          $scope.isPowerChartDataLoaded = true;
        }, 300);
      };

      $scope.onEnergyTabOpen = function () {
        $scope.isEnergyChartDataLoaded = false;
        $timeout(function () {
          $scope.energyChartInstance.redraw();
          $scope.energyChartInstance.reflow();
          $scope.isEnergyChartDataLoaded = true;
        }, 300);
      };

      $scope.drawMap = function () {
        if ($scope.lastFacilityInfo.location.availability) {
          var facilityMapWidth = Math.ceil($('.ppd-mapphoto').width() / 2),
              facilityPosition = [ $scope.lastFacilityInfo.location.latitude,
                $scope.lastFacilityInfo.location.longitude ].join(',');
          var ppdmapHtml = '<img src="https://maps.googleapis.com/maps/api/staticmap?center=';
          ppdmapHtml += facilityPosition + '&markers=' + facilityPosition + '&zoom=14&size=';
          ppdmapHtml += facilityMapWidth + 'x410">';
          $('#ppdmap_container').html(ppdmapHtml);
        }
      };

      $scope.drawChart = function () {
        $scope.powerChartConfig.xAxis.categories = $scope.lastFacilityInfo.powerChart.categories;
        $scope.powerChartConfig.series[0].data = $scope.lastFacilityInfo.powerChart.series;

        $scope.energyChartConfig.xAxis.categories = $scope.lastFacilityInfo.energyChart.categories;
        $scope.energyChartConfig.series[0].data = $scope.lastFacilityInfo.energyChart.series;
      };

      $scope.startWatchFacilityDrilldown();
    }
  ]);

$(document).ready(function () {
  var windowWidth = $(window).width();
  if (windowWidth < 1024) {
    $('body').addClass('collapsed');
    $('#wrapper').addClass('collapsed');
  }
});

angular.module("bl.analyze.solar.surface").run(["$templateCache", function($templateCache) {$templateCache.put("app/partials/facility-details.html","<div id=\"powerplantdetails-modal\" class=\"panel corner powerplant-details\" as-element-show-loading=\"{{ !isDataLoaded }}\">\r\n    <div class=\"panel-heading\">\r\n        <i class=\"icon icon-ui-info\"></i>\r\n        <h5 class=\"panel-title drilldown\">\r\n            Power Plant Details\r\n        </h5>\r\n        <a class=\"drilldown-close\" ng-click=\"closeDrilldown()\"></a>\r\n    </div>\r\n    <div class=\"panel-body\">\r\n        <div class=\"widget\">\r\n            <div class=\"row\">\r\n                <div class=\"col-md-6\">\r\n                    <div class=\"ppd-row has-padding\">\r\n                        <div class=\"ppd-label\">Location</div>\r\n                        <div class=\"ppd-value\"><strong>{{lastFacilityInfo.installAddress ? lastFacilityInfo.installAddress : \'N/A\'}}</strong></div>\r\n                    </div>\r\n                    <div class=\"ppd-row\">\r\n                        <div class=\"ppd-label\">Operator</div>\r\n                        <div class=\"ppd-value\"><strong>{{lastFacilityInfo.operator}}</strong></div>\r\n                    </div>\r\n                    <div class=\"ppd-row\">\r\n                        <div class=\"ppd-label\">Commissioning Date</div>\r\n                        <div class=\"ppd-value\"><strong>{{lastFacilityInfo.commissioningDate}}</strong></div>\r\n                    </div>\r\n                    <div class=\"ppd-row has-padding\">\r\n                        <div class=\"ppd-label\">Potential Power</div>\r\n                        <div class=\"ppd-value\">\r\n                            <strong><span class=\"kpi\">{{lastFacilityInfo.potentialPower | number:1 }} kW</span></strong>\r\n                        </div>\r\n                    </div>\r\n                    <div class=\"ppd-row\">\r\n                        <div class=\"ppd-label\">Estimated Annual Production</div>\r\n                        <div class=\"ppd-value\">\r\n                            <strong>Approx. <span class=\"kpi\">{{lastFacilityInfo.predictedAnnualGeneration | number:0}} kWh</span></strong>\r\n                        </div>\r\n                    </div>\r\n                    <div class=\"ppd-row\">\r\n                        <div class=\"ppd-label\">Estimated Carbon Dioxide Emissions Avoided</div>\r\n                        <div class=\"ppd-value\">\r\n                            <strong>Approx. <span class=\"kpi\">{{lastFacilityInfo.predictedAnnualCarbon | number:1}} lbs</span> per year</strong>\r\n                        </div>\r\n                    </div>\r\n                    <!--div class=\"ppd-row has-padding\">\r\n                        <div class=\"ppd-label\">Description</div>\r\n                        <div class=\"ppd-value\">{{currentFacility.description}}</div>\r\n                    </div-->\r\n                </div>\r\n                <div class=\"col-md-6 ppd-mapphoto\">\r\n                    <div class=\"col-md-6 ppd-photo pull-right\" ng-if=\"lastFacilityInfo.facilityImage !== \'NOIMAGE\'\">\r\n                        <img ng-src=\"{{lastFacilityInfo.facilityImage}}\" class=\"img-responsive\" alt=\"Power Plant Picture\"/>\r\n                    </div>\r\n                    <div class=\"col-md-6 map-wrapper pull-right\" id=\"ppdmap_container\">\r\n                    </div>\r\n                    &nbsp;\r\n                </div>\r\n            </div>\r\n        </div>\r\n        <div class=\"ppd-charts\">\r\n            <tabset>\r\n                <tab heading=\"Real-Time Max Power\" class=\"first\" select=\"onPowerTabOpen();\">\r\n                    <div class=\"chart-container\" as-element-show-loading=\"{{ !isPowerChartDataLoaded }}\">\r\n                        <highchart id=\"ppdAreaChart\" config=\"powerChartConfig\" style=\"width:100%\"></highchart>\r\n                    </div>\r\n                </tab>\r\n                <tab heading=\"Energy\" class=\"last\" select=\"onEnergyTabOpen();\">\r\n                    <div class=\"energy\" as-element-show-loading=\"{{ !isEnergyChartDataLoaded }}\">\r\n                        <div class=\"date-range-nav row\">\r\n                            <div class=\"col-xs-4 text-left\">\r\n                                <a class=\"prev-nav\" ng-click=\"selectYear(selectedYear - 1)\" style=\"display: block;\">\r\n                                    <span class=\"hidden-xs\">\r\n                                        <i class=\"icon-ui-arrow-left\"></i>  {{selectedYear - 1}}\r\n                                    </span>\r\n                                </a>\r\n                            </div>\r\n                            <div class=\"col-xs-4 text-center\">\r\n                                <span class=\"cur-nav\">Year {{selectedYear}}</span>\r\n                            </div>\r\n                            <div class=\"col-xs-4 text-right\">\r\n                                <a class=\"next-nav\" ng-click=\"selectYear(selectedYear + 1)\" style=\"display: {{ selectedYear < currentYear ? \'block\' : \'none\' }}\">\r\n                                    <span class=\"hidden-xs\">\r\n                                        {{selectedYear + 1}}\r\n                                        <i class=\"icon-ui-arrow-right\"></i>\r\n                                    </span>\r\n                                </a>\r\n                            </div>\r\n                        </div>\r\n                        <highchart config=\"energyChartConfig\" style=\"width:100%\"></highchart>\r\n                        <div class=\"footer\">\r\n                            <div class=\"kpis\">\r\n                                <div class=\"kpi\">\r\n                                    <div class=\"kpi-title\">Total Production</div>\r\n                                    <div class=\"kpi-value\">\r\n                                        {{lastFacilityInfo.energyChart.totalProduction | number:0 }} kWh\r\n                                    </div>\r\n                                </div>\r\n                            </div>\r\n                        </div>\r\n                    </div>\r\n                </tab>\r\n            </tabset>\r\n        </div>\r\n    </div>\r\n</div>");
$templateCache.put("app/partials/help.html","<div id=\"help-panel\">\r\n    <div class=\"inner-wrapper\">\r\n        <div class=\"help-header\">\r\n            <h3>Help Center</h3>\r\n            <a class=\"close\" ng-click=\"closeHelp()\">×</a>\r\n        </div>\r\n        <div class=\"help-search-wrapper\">\r\n            <div class=\"row\">\r\n                <div class=\"col-md-6\">\r\n                    <form class=\"form-help-search\">\r\n                        <div class=\"search-input-wrapper\">\r\n                            <input type=\"text\" placeholder=\"How can we help you?\" />\r\n                            <button type=\"submit\" class=\"btn-submit icon icon-ui-search\"></button>\r\n                        </div>\r\n                    </form>\r\n                </div>\r\n                <div class=\"col-md-6\">\r\n                    <ul class=\"list-inline nav-list pull-right\">\r\n                        <li>\r\n                            <a href=\"#\"><span class=\"badge\">2</span></a>\r\n                        </li>\r\n                        <li>\r\n                            <a>Open Tickets</a>\r\n                        </li>\r\n                        <li>\r\n                            <a>Resolved</a>\r\n                        </li>\r\n                    </ul>\r\n                </div>\r\n            </div>\r\n        </div>\r\n        <div class=\"help-content\">\r\n            <div class=\"row\">\r\n                <div class=\"col-md-8\" ng-show=\"articleView\">\r\n                    <div class=\"subbox article-box\">\r\n                        <div class=\"header\"><h3>Current Power</h3></div>\r\n                        <div class=\"contents contentHelpArticle\">\r\n                            <p>Your system is currently producing 0.8 kilowatts (kW) of power out of a potential at 25 kW.</p>\r\n                            <p>Your power will rise and fall throughout the day depending on the availability of sunlight, but 8 kW is above your current average of 5 kW for the day.</p>\r\n                            <img src=\"/assets/img/help-article-sample.png\" alt=\"\" />\r\n                        </div>\r\n                    </div>\r\n                </div>\r\n\r\n                <div class=\"col-md-4\">\r\n                    <div class=\"subbox knowledge-box\" ng-class=\"{\'has-border\': articleView}\">\r\n                        <div class=\"header\"><h3>Knowledge Base</h3></div>\r\n                        <div class=\"contents\">\r\n                            <ul>\r\n                                <li ng-repeat=\"article in knowledgeArticles\"><a ng-click=\"goArticle()\">{{article.title}}</a></li>\r\n                            </ul>\r\n                        </div>\r\n                    </div>\r\n\r\n                    <div class=\"subbox contact-box\" ng-class=\"{\'has-border\': articleView}\">\r\n                        <div class=\"header\"><h3>Contact Support</h3></div>\r\n                        <div class=\"description\">If you can\'t find the information you need in our Knowledge Base or Glossary, please contact our support team with your question.</div>\r\n                        <div class=\"contents\">\r\n                            <div class=\"form-row\">\r\n                                <input type=\"text\" placeholder=\"Subject\" />\r\n                            </div>\r\n                            <div class=\"form-row\">\r\n                                <textarea placeholder=\"Message\"></textarea>\r\n                            </div>\r\n                            <div class=\"form-row\">\r\n                                <button>Send Message</button>\r\n                            </div>\r\n                        </div>\r\n                    </div>\r\n                </div>\r\n\r\n                <div class=\"col-md-8\" ng-show=\"homeView\">\r\n                    <div class=\"subbox glossary-box\" ng-class=\"{\'has-border\': homeView}\">\r\n                        <div class=\"header\"><h3>Glossary</h3></div>\r\n                        <div class=\"contents\">\r\n                            <ul class=\"list-inline\">\r\n                                <li ng-repeat=\"tag in staticGlossary\"><a ng-click=\"goArticle()\">{{tag}}</a></li>\r\n                            </ul>\r\n                            <ul class=\"list-inline\">\r\n                                <li ng-repeat=\"tag in filteredGlossary\"><a ng-click=\"goArticle()\">{{tag}}</a></li>\r\n                            </ul>\r\n                            <a class=\"more-link\">Show More</a>\r\n                        </div>\r\n                    </div>\r\n\r\n                    <div class=\"subbox faq-box\" ng-class=\"{\'has-border\': homeView}\">\r\n                        <div class=\"header\"><h3>Frequently Asked Questions</h3></div>\r\n                        <div class=\"contents\">\r\n                            <ul>\r\n                                <li ng-repeat=\"article in faqArticles\"><a ng-click=\"goArticle()\">{{article.title}}</a></li>\r\n                            </ul>\r\n                        </div>\r\n                    </div>\r\n                </div>\r\n            </div>\r\n        </div>\r\n    </div>\r\n</div>");
$templateCache.put("app/partials/main-stage.html","<!--<div class=\"kpi-group-mobile\">\r\n    <div class=\"sp-kpi-group\">\r\n        <div class=\"row\">\r\n            <div class=\"col-xs-6\">\r\n                <div class=\"wrapper-kpi\">\r\n                    <as-meter-bar min=\"0.1\" max=\"2.3\" ng-model=\"currentPower\"></as-meter-bar>\r\n                    <div class=\"numeric-content\">\r\n                        <span class=\"kpi-title\">Current Power</span>\r\n                        <b class=\"kpi-value\">\r\n                            0.8\r\n                            <sup>kW</sup>\r\n                        </b>\r\n                    </div>\r\n                </div>\r\n            </div>\r\n            <div class=\"col-xs-6\">\r\n                <div class=\"wrapper-kpi\">\r\n                    <as-meter-bar min=\"12\" max=\"39\" ng-model=\"currentEnergy\"></as-meter-bar>\r\n                    <div class=\"numeric-content\">\r\n                        <span class=\"kpi-title\">Today\"s Energy</span>\r\n                        <b class=\"kpi-value\">\r\n                            18\r\n                            <sup>kWh</sup>\r\n                        </b>\r\n                    </div>\r\n                </div>\r\n            </div>\r\n        </div>\r\n    </div>\r\n</div>-->\r\n<div id=\"wrapper-main-stage\" class=\"as-grid-container\">\r\n    <div class=\"as-col-xl-8 as-col-lg-12 as-col-md-12 as-col-sm-12\">\r\n        <div class=\"element-wrapper tall\">\r\n            <element-solar-energy-production></element-solar-energy-production>\r\n        </div>\r\n    </div>\r\n    <div class=\"as-col-xl-4 as-col-lg-4 as-col-sm-12 normal-case\">\r\n        <div class=\"as-grid-container\">\r\n            <div class=\"as-col-lg-6 as-col-md-3 as-col-sm-4\">\r\n                <div class=\"element-wrapper element-atom-wrapper\">\r\n                    <element-savings></element-savings>\r\n                </div>\r\n            </div>\r\n            <div class=\"as-col-lg-6 as-col-md-3 as-col-sm-hidden\">\r\n                <div class=\"element-wrapper element-atom-wrapper\">\r\n                    <element-total-energy-production></element-total-energy-production>\r\n                </div>\r\n            </div>\r\n            <div class=\"as-col-lg-12 as-col-md-6 as-col-sm-8\">\r\n                <div class=\"element-wrapper\">\r\n                    <element-equivalencies></element-equivalencies>\r\n                </div>\r\n            </div>\r\n        </div>\r\n    </div>\r\n    <div class=\"as-col-xl-4 as-col-lg-12 as-col-sm-12 special-case\">\r\n        <div class=\"as-grid-container\">\r\n            <div class=\"as-col-lg-4 as-col-md-4 as-col-sm-4\">\r\n                <div class=\"as-col-lg-12 as-col-md-12 as-col-sm-12\">\r\n                    <div class=\"element-wrapper\">\r\n                        <element-savings></element-savings>\r\n                    </div>\r\n                </div>\r\n                <div class=\"as-col-lg-12 as-col-md-12 as-col-sm-12\">\r\n                    <div class=\"element-wrapper\">\r\n                        <element-total-energy-production></element-total-energy-production>\r\n                    </div>\r\n                </div>\r\n            </div>\r\n            <div class=\"as-col-lg-8 as-col-md-8 as-col-sm-8\">\r\n                <div class=\"as-col-lg-12 as-col-md-12 as-col-sm-12\">\r\n                    <div class=\"element-wrapper\">\r\n                        <element-equivalencies></element-equivalencies>\r\n                    </div>\r\n                </div>\r\n                <div class=\"as-col-lg-12 as-col-md-12 as-col-sm-12 has-zindex-2\">\r\n                    <div class=\"element-wrapper\">\r\n                        <element-yield-comparison></element-yield-comparison>\r\n                    </div>\r\n                </div>\r\n            </div>\r\n        </div>\r\n    </div>\r\n    <div class=\"as-col-xl-6 as-col-lg-8 as-col-md-12 as-col-sm-12 rtp-container\">\r\n        <div class=\"element-wrapper tall\">\r\n            <element-realtime-power></element-realtime-power>\r\n        </div>\r\n    </div>\r\n    <!--div class=\"as-col-xl-6 as-col-lg-12 as-col-md-12 as-col-sm-12 special-case\">\r\n        <div class=\"element-wrapper tall\">\r\n            <element-realtime-power></element-realtime-power>\r\n        </div>\r\n    </div-->\r\n    <div class=\"as-col-xl-6 as-col-lg-12 as-col-md-12 as-col-sm-12\">\r\n        <div class=\"as-grid-container\">\r\n            <div class=\"as-col-xl-hidden as-col-lg-hidden as-col-md-hidden as-col-sm-4 as-col-xs-hidden\">\r\n                <div class=\"element-wrapper element-atom-wrapper\">\r\n                    <element-total-energy-production></element-total-energy-production>\r\n                </div>\r\n            </div>\r\n            <div class=\"as-col-xl-12 as-col-lg-4 as-col-md-6 as-col-sm-8 has-zindex-2 normal-case\">\r\n                <div class=\"element-wrapper\">\r\n                    <element-yield-comparison></element-yield-comparison>\r\n                </div>\r\n            </div>\r\n            <div class=\"as-col-xl-8 as-col-lg-6 as-col-md-6 as-col-sm-8 avp-wrapper\">\r\n                <div class=\"element-wrapper\">\r\n                    <actual-predicted-energy></actual-predicted-energy>\r\n                </div>\r\n            </div>\r\n            <!--div class=\"as-col-xl-8 as-col-lg-9 as-col-md-8 as-col-sm-8 special-case\">\r\n                <div class=\"element-wrapper\">\r\n                    <actual-predicted-energy></actual-predicted-energy>\r\n                </div>\r\n            </div-->\r\n            <div class=\"as-col-xl-4 as-col-lg-2 as-col-md-4 as-col-sm-4 normal-case\">\r\n                <div class=\"element-wrapper\">\r\n                    <element-avoided-carbon></element-avoided-carbon>\r\n                </div>\r\n            </div>\r\n            <div class=\"as-col-xl-4 as-col-lg-3 as-col-md-4 as-col-sm-4 special-case\">\r\n                <div class=\"element-wrapper\">\r\n                    <element-avoided-carbon></element-avoided-carbon>\r\n                </div>\r\n            </div>\r\n        </div>\r\n    </div>\r\n</div>\r\n");
$templateCache.put("app/partials/navigation-bar.html","<nav class=\"navbar navbar-default glob-nav\">\r\n    <div class=\"container-fluid\">\r\n        <div class=\"navbar-header\"><a href=\"#!/main\" class=\"navbar-brand\">\r\n            <div class=\"brand-image\" ng-click=\"$root.isShowPlatformPanel=false\"></div>\r\n            <div class=\"icon icon-brighterlink\"></div><span class=\"large-space\">Analyze Solar</span><span class=\"grey-color\">Surface</span></a></div>\r\n        <ul class=\"nav navbar-links\">\r\n            <li>\r\n                <as-nav-popup title=\"More Apps\" class=\"link-app-panel\">\r\n                    <ul class=\"list-brighterlink-apps\">\r\n                        <li ng-repeat=\"app in blAppList\" ng-class=\"app.className\">\r\n                            <a ng-href=\"app.href\" target=\"_blank\">\r\n                                <span class=\"app-icon\"></span>\r\n                                <span class=\"app-label\" ng-bind=\"app.label\">BL App</span>\r\n                            </a>\r\n                        </li>\r\n                    </ul>\r\n                </as-nav-popup>\r\n            </li>\r\n            <li>\r\n                <a class=\"avatar-wrapper\">\r\n                    <span class=\"availability\" ng-class=\"{online: userInfo.online}\"></span>\r\n                    <span class=\"avatar\" ng-style=\"userInfo.avatarStyle\" ng-bind=\"userInfo.nameInitial\"></span>\r\n                </a>\r\n                <as-nav-popup title=\"Settings\" class=\"link-settings\">\r\n                    <ul class=\"list-settings-links\">\r\n                        <li>\r\n                            <a ng-click=\"openPlatformPanel(\'user\')\">\r\n                                <i class=\"icon icon-user\"></i> Profile\r\n                            </a>\r\n                        </li>\r\n                        <li>\r\n                            <a ng-click=\"openPlatformPanel(\'account\')\">\r\n                                <i class=\"icon icon-account\"></i> Account\r\n                            </a>\r\n                        </li>\r\n                        <li>\r\n                            <a ng-click=\"doLogout()\">\r\n                                <i class=\"icon icon-exit\"></i> Logout\r\n                            </a>\r\n                        </li>\r\n                    </ul>\r\n                </as-nav-popup>\r\n            </li>\r\n        </ul>\r\n        <!--button type=\"button\" data-toggle=\"collapse\" data-target=\"#ass-mobile-nav\" class=\"navbar-toggle collapsed\"><span class=\"sr-only\">Toggle navigation</span><span class=\"icon-bar\"></span><span class=\"icon-bar\"></span><span class=\"icon-bar\"></span></button-->\r\n        <a href=\"#mobile-dropdown-menu\" class=\"navbar-toggle\"><span class=\"sr-only\">Toggle navigation</span><span class=\"icon-bar\"></span><span class=\"icon-bar\"></span><span class=\"icon-bar\"></span></a>\r\n        <nav id=\"mobile-dropdown-menu\" as-mobile-nav-drop-down=\"right\">\r\n            <div class=\"wrapper\">\r\n                <ul class=\"list-settings-links\">\r\n                    <li><a ng-click=\"openPlatformPanel(\'user\')\"><i class=\"icon icon-user\"></i> Profile</a></li>\r\n                    <li><a ng-click=\"openPlatformPanel(\'account\')\"><i class=\"icon icon-account\"></i> Account</a></li>\r\n                    <li><a ng-click=\"doLogout()\"><i class=\"icon icon-exit\"></i> Logout</a></li>\r\n                </ul>\r\n                <div class=\"apps-wrapper\">\r\n                    <ul class=\"list-brighterlink-apps\">\r\n                        <li ng-repeat=\"app in blAppList\" ng-class=\"app.className\">\r\n                            <a ng-href=\"app.href\" target=\"_blank\">\r\n                                <span class=\"app-icon\"></span>\r\n                                <span class=\"app-label\" ng-bind=\"app.label\">BL App</span>\r\n                            </a>\r\n                        </li>\r\n                    </ul>\r\n                </div>\r\n            </div>\r\n        </nav>\r\n    </div>\r\n</nav>");
$templateCache.put("app/partials/quick-access-bar.html","");
$templateCache.put("app/partials/selection-panel.html","");
$templateCache.put("app/elements/actual-predicted-energy/template.html","<div class=\"panel\" id=\"actual-predicted-energy\" as-element-show-loading=\"{{ !isDataLoaded }}\">\r\n    <div class=\"panel-heading\">\r\n        <as-more-panel position=\"top left\" panel-title=\"Actual vs Estimated Energy\">\r\n            <div ng-include=\"\'app/partials/more-panels/actual-predicted-energy.html\'\"></div>\r\n        </as-more-panel>\r\n        <h5 class=\"panel-title\" ng-click=\"detailElement()\">\r\n            Actual vs Estimated Energy\r\n        </h5>\r\n        <as-date-range-selector class=\"small\" ng-model=\"dateRange\" ranges=\"year,total\"></as-date-range-selector>\r\n    </div>\r\n    <div class=\"panel-body\">\r\n        <div class=\"widget\">\r\n            <div class=\"chart-container\">\r\n                <highchart id=\"chartActualPredictedEnergy\" config=\"avpeChartConfig\"></highchart>\r\n            </div>\r\n        </div>\r\n    </div>\r\n</div>");
$templateCache.put("app/elements/avoided-carbon/template.html","<div class=\"panel element-numeric element-atom avoided-widget\" as-element-show-loading=\"{{ !isDataLoaded }}\" id=\"avoided-carbon\">\r\n	<div class=\"panel-heading\">\r\n		<as-more-panel class=\"as-col-xl-hidden as-col-lg-hidden as-col-md-hidden as-col-sm-hidden\" panel-title=\"What does Avoided Carbon Dioxide mean?\" classes=\"more-carbon\">\r\n			<div ng-include=\"\'app/partials/more-panels/avoided-carbon.html\'\"></div>\r\n		</as-more-panel>\r\n		<as-more-panel class=\"as-col-xs-hidden\" position=\"top right\" panel-title=\"What does Avoided Carbon Dioxide mean?\" classes=\"more-carbon\">\r\n			<div ng-include=\"\'app/partials/more-panels/avoided-carbon.html\'\"></div>\r\n		</as-more-panel>\r\n		<h5 class=\"panel-title carbon\">\r\n			Avoided Carbon Dioxide Emissions\r\n		</h5>\r\n		<as-date-range-selector ng-model=\"dateRange\" ranges=\"month,year,total\" force-dropdown=\"true\"></as-date-range-selector>\r\n	</div>\r\n	<div class=\"panel-body\">\r\n		<div class=\"content\">\r\n			<div class=\"avoided-value\">\r\n				<b as-tooltip tooltip-text=\"infoPanelText\" tooltip-position=\"left middle\" tooltip-classes=\"kpi-tooltip\">\r\n					<as-animated-number ng-bind=\"lastCarbonAvoided.carbonAvoided\" data-num-decimals=\"1\" compress=\"true\"></as-animated-number><sup>lbs</sup>\r\n				</b>\r\n			</div>\r\n			<div class=\"avoided-total\">Total All Time: <as-animated-number ng-bind=\"lastCarbonAvoided.carbonAvoidedTotal\"></as-animated-number> lbs</div>\r\n		</div>\r\n	</div>\r\n</div>");
$templateCache.put("app/elements/equivalencies/drilldown.html","<div id=\"equivalencies-drilldown\">\r\n    <!-- element equivalencies-drilldown-->\r\n    <div class=\"panel\" as-element-show-loading=\"{{ !isDataLoaded }}\">\r\n        <div class=\"panel-heading\">\r\n            <i class=\"icon icon-ui-info\"></i>\r\n            <h5 class=\"panel-title drilldown\">\r\n                Equivalencies\r\n            </h5>\r\n            <a class=\"drilldown-close\" ng-click=\"closeDrilldown()\"></a>\r\n        </div>\r\n        <div class=\"panel-body\">\r\n            <div class=\"equiv-widget-detail\">\r\n            <div class=\"detail-info row\">\r\n                <div class=\"col-md-6\">\r\n                    <ul>\r\n                        <li>\r\n                            <i class=\"icon icon-cars\"></i>\r\n                            <span class=\"equiv-name\">Cars Removed</span>\r\n                            <span class=\"multiply-icon\">x</span>\r\n                            <b class=\"equiv-value\" as-animated-number ng-bind=\"lastEquiv.carsRemoved|number:2\" data-num-decimals=\"2\"></b>\r\n                        </li>\r\n                        <li>\r\n                            <i class=\"icon icon-homes\"></i>\r\n                            <span class=\"equiv-name\">Homes Powered</span>\r\n                            <span class=\"multiply-icon\">x</span>\r\n                            <b class=\"equiv-value\" as-animated-number ng-bind=\"lastEquiv.homePowered|number:2\" data-num-decimals=\"2\"></b>\r\n                        </li>\r\n                        <li>\r\n                            <i class=\"icon icon-seedlings\"></i>\r\n                            <span class=\"equiv-name\">Seedlings Grown</span>\r\n                            <span class=\"multiply-icon\">x</span>\r\n                            <b class=\"equiv-value\" as-animated-number ng-bind=\"lastEquiv.seedlingsGrown|number:2\" data-num-decimals=\"2\"></b>\r\n                        </li>\r\n                        <li>\r\n                            <i class=\"icon icon-refrigirator\"></i>\r\n                            <span class=\"equiv-name\">Refrigerators</span>\r\n                            <span class=\"multiply-icon\">x</span>\r\n                            <b class=\"equiv-value\" as-animated-number ng-bind=\"lastEquiv.refrigerators|number:2\" data-num-decimals=\"2\"></b>\r\n                        </li>\r\n                        <li>\r\n                            <i class=\"icon icon-mobile\"></i>\r\n                            <span class=\"equiv-name\">Mobile Phones</span>\r\n                            <span class=\"multiply-icon\">x</span>\r\n                            <b class=\"equiv-value\" as-animated-number ng-bind=\"lastEquiv.mobilePhones|number:2\" data-num-decimals=\"2\"></b>\r\n                        </li>\r\n                        <li>\r\n                            <i class=\"icon icon-aa-battery\"></i>\r\n                            <span class=\"equiv-name\">AA Batteries</span>\r\n                            <span class=\"multiply-icon\">x</span>\r\n                            <b class=\"equiv-value\" as-animated-number ng-bind=\"lastEquiv.batteries|number:2\" data-num-decimals=\"2\"></b>\r\n                        </li>\r\n                        <li>\r\n                            <i class=\"icon icon-co2\"></i>\r\n                            <span class=\"equiv-name\">Avoided Carbon</span>\r\n                            <span class=\"multiply-icon\">x</span>\r\n                            <b class=\"equiv-value\"><as-animated-number ng-bind=\"lastEquiv.avoidedCarbon|number:2\" data-num-decimals=\"2\"></as-animated-number><sup>kg</sup></b>\r\n                        </li>\r\n                    </ul>\r\n                </div>\r\n                <div class=\"col-md-6\">\r\n                    <ul>\r\n                        <li>\r\n                            <i class=\"icon icon-gas\"></i>\r\n                            <span class=\"equiv-name\">Gallons of Gas</span>\r\n                            <span class=\"multiply-icon\">x</span>\r\n                            <b class=\"equiv-value\" as-animated-number ng-bind=\"lastEquiv.gallonsGas|number:2\" data-num-decimals=\"2\"></b>\r\n                        </li>\r\n                        <li>\r\n                            <i class=\"icon icon-gas-gallons\"></i>\r\n                            <span class=\"equiv-name\">Tankers of Gas</span>\r\n                            <span class=\"multiply-icon\">x</span>\r\n                            <b class=\"equiv-value\" as-animated-number ng-bind=\"lastEquiv.tankersGas|number:2\" data-num-decimals=\"2\"></b>\r\n                        </li>\r\n                        <li>\r\n                            <i class=\"icon icon-railroad-car\"></i>\r\n                            <span class=\"equiv-name\">Railroad Cars of Coal</span>\r\n                            <span class=\"multiply-icon\">x</span>\r\n                            <b class=\"equiv-value\" as-animated-number ng-bind=\"lastEquiv.railroadCarsCoal|number:2\" data-num-decimals=\"2\"></b>\r\n                        </li>\r\n                        <li>\r\n                            <i class=\"icon icon-oil-barrel\"></i>\r\n                            <span class=\"equiv-name\">Barrels Oil</span>\r\n                            <span class=\"multiply-icon\">x</span>\r\n                            <b class=\"equiv-value\" as-animated-number ng-bind=\"lastEquiv.barrelsOil|number:2\" data-num-decimals=\"2\"></b>\r\n                        </li>\r\n                        <li>\r\n                            <i class=\"icon icon-propane\"></i>\r\n                            <span class=\"equiv-name\">Propane Cylinders</span>\r\n                            <span class=\"multiply-icon\">x</span>\r\n                            <b class=\"equiv-value\" as-animated-number ng-bind=\"lastEquiv.propaneCylinders|number:2\" data-num-decimals=\"2\"></b>\r\n                        </li>\r\n                        <li>\r\n                            <i class=\"icon icon-power-plant\"></i>\r\n                            <span class=\"equiv-name\">Power Plants</span>\r\n                            <span class=\"multiply-icon\">x</span>\r\n                            <b class=\"equiv-value\" as-animated-number ng-bind=\"lastEquiv.powerPlants|number:2\" data-num-decimals=\"2\"></b>\r\n                        </li>\r\n                    </ul>\r\n                </div>\r\n            </div>\r\n            <div class=\"description row\">\r\n                <div class=\"col-md-12 title\"><b>How Are Equivalencies Calculated?</b></div>\r\n                <div class=\"col-md-6\">\r\n                    <p>Energy is produced, consumed, or stored. So, comparing the watt-hours of energy stored by a battery to the kilowatt-hours produced by your solar array is relatively easy. But, what about the energy stored in a gallon of gas or a barrel of oil? And, how is there any correlation between a kilowatt-hour and a seedling?</p>\r\n                    <p>The Emissions & Generation Resource Integrated Database (eGRID) publishes an emissions rate for carbon dioxide (CO2). This rate represents how much CO2 is produced in the U.S. annually through the generation of electric power. </p>\r\n                </div>\r\n                <div class=\"col-md-6\">\r\n                    <p>Generally speaking, a kWh from the United States power grid produces 15.2 pounds of CO2. This is known as the “Emissions Factor.“</p>\r\n                    <p>Like utility power plants, fuels such as gas, oil, and propane produce CO2 when they are converted to energy. Likewise, plants absorb CO2. So, we can use the Emissions Factor to compare the energy produced by your solar array to the CO2 something produces or consumes. </p>\r\n                    <p>To learn more, visit eGrid or do you own calculations using the EPA’s Greenhouse Gas Equivalencies Calculator. </p>\r\n                </div>\r\n            </div>\r\n        </div>\r\n        </div>\r\n    </div>\r\n</div>");
$templateCache.put("app/elements/equivalencies/template.html","<div class=\"panel equiv-widget\" id=\"equivalencies\" as-element-show-loading=\"{{ !isDataLoaded }}\">\r\n    <div class=\"panel-heading\">\r\n        <as-more-panel position=\"bottom left\" panel-title=\"How Are Equivalencies Calculated?\">\r\n            <div ng-include=\"\'app/partials/more-panels/equivalencies.html\'\"></div>\r\n        </as-more-panel>\r\n        <h5 class=\"panel-title\">\r\n            Equivalencies\r\n        </h5>\r\n        <as-date-range-selector ng-model=\"dateRange\" ranges=\"month,year,total\" class=\"small\"></as-date-range-selector>\r\n    </div>\r\n    <div class=\"panel-body\">\r\n        <div class=\"content\">\r\n        <div class=\"element-block first\" as-tooltip tooltip-content-dom=\"#infoEquivCar\" tooltip-position=\"bottom center\" tooltip-classes=\"kpi-tooltip\">\r\n            <div class=\"equiv-value\">\r\n                <b><as-animated-number ng-bind=\"lastEquiv.carsRemoved\" compress=\"true\" data-num-decimals=\"2\"></as-animated-number></b>\r\n                <span ng-show=\"carMillions\">Millions</span>\r\n            </div>\r\n            <div class=\"icon-area\">\r\n                <span class=\"multiply-icon\">x</span>\r\n                <i class=\"icon icon-cars\"></i>\r\n            </div>\r\n            <span class=\"element-title\">Cars Removed</span>\r\n        </div>\r\n        <div class=\"element-block\" as-tooltip tooltip-content-dom=\"#infoEquivHome\" tooltip-position=\"bottom center\" tooltip-classes=\"kpi-tooltip\">\r\n            <div class=\"equiv-value\">\r\n                <b><as-animated-number ng-bind=\"lastEquiv.homePowered\" compress=\"true\" data-num-decimals=\"2\"></as-animated-number></b>\r\n                <span ng-show=\"homeMillions\">Millions</span>\r\n            </div>\r\n            <div class=\"icon-area\">\r\n                <span class=\"multiply-icon\">x</span>\r\n                <i class=\"icon icon-homes\"></i>\r\n            </div>\r\n            <span class=\"element-title\">Homes Powered</span>\r\n        </div>\r\n        <div class=\"element-block last\" as-tooltip tooltip-content-dom=\"#infoEquivSeedling\" tooltip-position=\"right middle\" tooltip-classes=\"kpi-tooltip\">\r\n            <div class=\"equiv-value\">\r\n                <b><as-animated-number ng-bind=\"lastEquiv.seedlingsGrown\" compress=\"true\"></as-animated-number></b>\r\n                <span ng-show=\"seedlingMillions\">Millions</span>\r\n            </div>\r\n            <div class=\"icon-area\">\r\n                <span class=\"multiply-icon\">x</span>\r\n                <i class=\"icon icon-seedlings\"></i>\r\n            </div>\r\n            <span class=\"element-title\">Seedlings Grown</span>\r\n        </div>\r\n        <div class=\"clearfix\"></div>\r\n        <div class=\"info-panel\" id=\"infoEquivCar\">\r\n            <p>The average car gets 21.4 miles per gallon of gas, and travels over 11,000 miles year.</p>\r\n            <p>One gallon of gas is equivalent to <span class=\"kpi\">13kWh</span>. So, the <span class=\"kpi\" ng-bind=\"lastEquiv.kwh + \'kWh\'\">0kWh</span> generated by your solar array<span ng-bind=\"dateRangeLabels | lowercase\"></span> is the equivalent of taking <span class=\"kpi\" ng-bind=\"lastEquiv.carsRemoved | number : 2\"></span> car(s) off of the road for a full year. </p>\r\n        </div>\r\n        <div class=\"info-panel\" id=\"infoEquivHome\">\r\n            <p>The average home consumes over 12,000 kWh every year.</p>\r\n            <p>So, the <span class=\"kpi\" ng-bind=\"lastEquiv.kwh + \'kWh\'\">0kWh</span> generated by your solar array{{dateRangeLabels | lowercase}} is the equivalent of powering <span class=\"kpi\" ng-bind=\"lastEquiv.homePowered|number:2\"></span> homes for a full year.</p>\r\n        </div>\r\n        <div class=\"info-panel\" id=\"infoEquivSeedling\">\r\n            <p>A coniferous tree sequesters 23.2lbs of carbon over ten years, which is equivalent to about <span class=\"kpi\">0.02kWh</span>.</p>\r\n            <p>So, the <span class=\"kpi\" ng-bind=\"lastEquiv.kwh + \'kWh\'\">0kWh</span> generated by your solar array{{dateRangeLabels | lowercase}} is the equivalent of growing <span class=\"kpi\" ng-bind=\"lastEquiv.seedlingsGrown|number:2\"></span> trees.</p>\r\n        </div>\r\n    </div>\r\n    </div>\r\n</div>");
$templateCache.put("app/elements/realtime-power/drilldown.html","<div id=\"currentpower-modal\" class=\"opened-sp\">\r\n	<div class=\"clearfix\">\r\n		<div class=\"col-md-12 no-padding\">\r\n			<div class=\"element current-power\">\r\n				<div class=\"loading-animation\" ng-hide=\"isDataLoaded\"></div>\r\n				<div class=\"header\">\r\n					<h5 class=\"title\">\r\n						<a class=\"link-more\">\r\n							<i class=\"icon icon-ui-info\"></i>\r\n						</a>\r\n						Current Power\r\n					</h5>\r\n					<a class=\"drilldown-close\" ng-click=\"closeDrilldown()\"></a>\r\n				</div>\r\n				<div class=\"widget\">\r\n					<div id=\"energy-drilldown-combochart\" class=\"chart-container\">\r\n						<!--<highchart id=\"energy-drilldown-combochart\" config=\"chartConfig\" style=\"width:98%\"></highchart>-->\r\n					</div>\r\n				</div>\r\n				<div class=\"footer\">\r\n					<div class=\"kpis\">\r\n						<div class=\"kpi\">\r\n							<div class=\"kpi-title\">Total Production</div>\r\n							<div class=\"kpi-value\">\r\n								{{kpiData.totalEnergy | number:1 }}\r\n								<span class=\"unit\">kWh</span>\r\n							</div>\r\n						</div>\r\n						<div class=\"kpi\" ng-repeat=\"energySource in kpiData.energyBySources\">\r\n							<div class=\"kpi-title\">\r\n								<span style=\"color: {{ ::energySource.color }};\">&#9679;</span>\r\n								{{ ::energySource.displayName }}\r\n							</div>\r\n							<div class=\"kpi-value\">\r\n								{{energySource.kwh | number:1 }}\r\n								<span class=\"unit\">kWh</span>\r\n							</div>\r\n						</div>\r\n					</div>\r\n				</div>\r\n			</div>\r\n		</div>\r\n	</div>\r\n</div>");
$templateCache.put("app/elements/realtime-power/template.html","<div class=\"panel realtime-power\" id=\"realtime-power\" as-element-show-loading=\"{{ !isDataLoaded }}\">\r\n	<div class=\"panel-heading\">\r\n		<as-more-panel position=\"bottom left\" panel-title=\"Real-Time Max Power\">\r\n			<div ng-include=\"\'app/partials/more-panels/real-time-power.html\'\"></div>\r\n		</as-more-panel>\r\n		<h5 class=\"panel-title\" ng-bind=\"elementTitle\">Max Power</h5>\r\n		<as-date-range-selector ng-model=\"dateRange\" ranges=\"today,week,month\"></as-date-range-selector>\r\n	</div>\r\n	<div class=\"panel-body\">\r\n		<div class=\"widget\">\r\n			<div class=\"chart-container\">\r\n				<div class=\"nodata-chart\" ng-show=\"noDataRTP == true\">No data to display</div>\r\n				<highchart id=\"realtime-power-linechart\" config=\"primaryChart\" style=\"width:100%\" ng-show=\"noDataRTP == false\"></highchart>\r\n			</div>\r\n		</div>\r\n		<div class=\"footer\">\r\n			<div class=\"kpis\">\r\n				<div class=\"kpi\">\r\n					<div class=\"kpi-title\" ng-bind=\"totalKPITitle\">Current Day\'s Max</div>\r\n					<div class=\"kpi-value\">\r\n						<as-animated-number ng-bind=\"lastRTPower.kpiData.totalPowerGeneration\" data-num-decimals=\"1\"></as-animated-number>\r\n						<span class=\"unit\">kW</span>\r\n						<sup class=\"animated as-sink\" ng-show=\"lastRTPower.kpiData.totalPowerGenerationTrend == \'down\'\">↓</sup>\r\n						<sup class=\"animated as-float\" ng-show=\"lastRTPower.kpiData.totalPowerGenerationTrend == \'up\'\">↑</sup>\r\n					</div>\r\n				</div>\r\n				<div class=\"kpi\" ng-repeat=\"generation in lastRTPower.kpiData.generationBySources | limitTo: 3\">\r\n					<div class=\"kpi-title\">\r\n						<span style=\"color: {{ ::generation.color }};\">&#9679;</span>\r\n						{{ ::generation.displayName }}\r\n					</div>\r\n					<div class=\"kpi-value\">\r\n						<as-animated-number ng-bind=\"generation.kw\" data-num-decimals=\"1\"></as-animated-number>\r\n						<span class=\"unit\">kW</span>\r\n						<sup class=\"animated  as-sink\" ng-show=\"generation.trend == \'down\'\">↓</sup>\r\n						<sup class=\"animated  as-float\" ng-show=\"generation.trend == \'up\'\">↑</sup>\r\n					</div>\r\n				</div>\r\n			</div>\r\n		</div>\r\n	</div>\r\n</div>");
$templateCache.put("app/elements/savings/drilldown.html","<div id=\"savings-drilldown\" >\r\n	<div class=\"clearfix\">\r\n		<div class=\"col-sm-12 no-padding\">\r\n			<!-- ELEMENT Saving & Production -->\r\n			<div class=\"panel corner\" as-element-show-loading=\"{{ !isDataLoaded.comboChart }}\">\r\n				<div class=\"loading-animation\" ng-hide=\"isDataLoaded\"></div>\r\n				<div class=\"panel-heading\">\r\n					<i class=\"icon icon-ui-info\"></i>\r\n					<h5 class=\"panel-title drilldown\">\r\n						Savings\r\n					</h5>\r\n					<a class=\"drilldown-close\" ng-click=\"closeDrilldown()\"></a>\r\n				</div>\r\n				<div class=\"panel-body\">\r\n					<div class=\"widget\" style=\"width: 100%; min-height: 330px;\">\r\n						<highchart id=\"savingsComboChart\" config=\"comboChart\" class=\"widget chart-widget\"></highchart>\r\n					</div>\r\n					<div class=\"footer\">\r\n						<div class=\"kpis\">\r\n							<div class=\"kpi\">\r\n								<div class=\"kpi-title\">Total Savings</div>\r\n								<div class=\"kpi-value\">${{::kpiData.totalSavings}}</div>\r\n							</div>\r\n							<div class=\"kpi\">\r\n								<div class=\"kpi-title\">Total Production</div>\r\n								<div class=\"kpi-value\">{{kpiData.totalProduction | number:0 }}<span class=\"unit\">kWh</span></div>\r\n							</div>\r\n							<div class=\"kpi\" ng-repeat=\"production in kpiData.totalProductionBySources\">\r\n								<div class=\"kpi-title\">\r\n									<span style=\"color: {{ ::production.color }};\">&#9679;</span>\r\n									{{::production.displayName}}\r\n								</div>\r\n								<div class=\"kpi-value\">{{production.kwh | number:0 }}<span class=\"unit\">kWh</span></div>\r\n							</div>\r\n						</div>\r\n					</div>\r\n				</div>\r\n			</div>\r\n			<!-- End Saving & Production -->\r\n		</div>\r\n		<div class=\"col-sm-6 no-padding\">\r\n			<!-- Element Saving Per Facility -->\r\n            <div class=\"panel\" as-element-show-loading=\"{{ !isDataLoaded.areaChart }}\">\r\n            	<div class=\"loading-animation\" ng-hide=\"isDataLoaded\"></div>\r\n				<div class=\"panel-heading\">\r\n					<i class=\"icon icon-ui-info\"></i>\r\n					<h5 class=\"panel-title\">\r\n						Savings Per Facility\r\n					</h5>\r\n				</div>\r\n				<div class=\"panel-body\">\r\n					<div class=\"widget\" style=\"width: 100%; height: 494px;padding-top: 10px;\">\r\n						<highchart id=\"timelineChart\" config=\"areaChart\">\r\n					</div>\r\n				</div>\r\n			</div>\r\n			<!-- End Saving Per Sources -->\r\n        </div>\r\n        <div class=\"col-sm-6 no-padding\">\r\n            <!-- Element saving-per-month -->\r\n            <div class=\"panel\" as-element-show-loading=\"{{ !isDataLoaded.table }}\">\r\n				<div class=\"panel-heading\">\r\n					<i class=\"icon icon-ui-info\"></i>\r\n					<h5 class=\"panel-title\">\r\n						Savings Per Month\r\n					</h5>\r\n				</div>\r\n				<div class=\"panel-body\">\r\n					<div as-sp-list-scroll-bar class=\"row widget table-widget\" scroll-wrapper-height=\"494px\">\r\n				<!--\r\n					<div class=\"date-range\">\r\n			            <label for=\"date_from\">From:</label>\r\n			            <input type=\"text\" ng-model=\"tableChart.dateFrom\" id=\"date_from\">\r\n			            <label for=\"date_to\">To:</label>\r\n			            <input type=\"text\" ng-model=\"tableChart.dateTo\" id=\"date_to\">\r\n			        </div>\r\n			    -->\r\n						<table class=\"table ng-table-responsive\">\r\n							<tr class=\"\">\r\n								<th colspan=\"2\"></th>\r\n								<th ng-repeat=\"column in tableChart.columns\"><span>{{column}}</span></th>\r\n							</tr>\r\n							<tr ng-repeat=\"row in tableChart.data\">\r\n								<td colspan=\"2\"><span class=\"diff-percent\">{{row.percent}}%</span><span class=\"dimensions\">{{row.date | amDateFormat:\'MMMM, YYYY\'}}</span></td>\r\n								<td ng-repeat=\"sourceName in tableChart.sourceNames\" class=\"data\">\r\n									<span class=\"bold\"><span>$</span>{{(row.sources[sourceName].savings||0) | number:2 }}</span>\r\n									<span class=\"thin\">{{(row.sources[sourceName].kwh||0) | number:0 }} <span>kWh</span></span>\r\n								</td>\r\n							</tr>\r\n						</table>\r\n					</div>\r\n				</div>\r\n			</div>\r\n			<!-- End saving-per-month -->\r\n        </div>\r\n	</div>\r\n</div>");
$templateCache.put("app/elements/savings/template.html","<div class=\"panel element-numeric element-atom\" id=\"savings\" as-element-show-loading=\"{{ !isDataLoaded }}\">\r\n	<div class=\"panel-heading\">\r\n		<as-more-panel position=\"bottom left\" panel-title=\"Savings\">\r\n			<div id=\"wrapperSavingMorePanel\" ng-include=\"\'app/partials/more-panels/savings.html\'\"></div>\r\n		</as-more-panel>\r\n		<h5 class=\"panel-title\">\r\n			Savings\r\n		</h5>\r\n		<as-date-range-selector ng-model=\"dateRange\" ranges=\"week,month,year,total\" force-dropdown=\"true\"></as-date-range-selector>\r\n	</div>\r\n	<div class=\"panel-body\">\r\n		<div class=\"widget\">\r\n			<div class=\"kpi\" as-tooltip tooltip-content-dom=\"#infoSavings\" tooltip-position=\"right middle\" tooltip-classes=\"kpi-tooltip\">\r\n				<sup class=\"kpi-title\">$</sup>\r\n				<span class=\"kpi-value link-info numeric-data\" ng-bind=\"lastSavingData.kpi.totalSavingPerDateRange\" direction=\"right\" as-animated-number>0</span>\r\n			</div>\r\n			<div class=\"total\">\r\n				<span class=\"total-title\">Total: </span>\r\n				<span class=\"total-value\"> $\r\n					<b ng-bind=\"lastSavingData.kpi.totalSavings\" as-animated-number data-num-decimals=\"2\">0.00</b>\r\n				</span>\r\n			</div>\r\n		</div>\r\n		<div id=\"infoSavings\" class=\"info-panel\">\r\n			<p class=\"bottom\">The estimated value of your solar generation is determined by multiplying your total energy produced (in kWh) over a given time period by an estimated utility rate of <span class=\"kpi\">$0.10/kWh</span>. Your actual utility rate will vary.</p>\r\n		</div>\r\n	</div>\r\n</div>\r\n");
$templateCache.put("app/elements/solar-energy-production/drilldown.html","<div id=\"solar-energy-production-drilldown\">\r\n  <div class=\"clearfix\">\r\n    <div class=\"col-sm-12 no-padding\">\r\n      <!-- Element solar-energy-production-->\r\n      <div class=\"panel\" id=\"solar-energy-production-drilldown-element-1\" as-element-show-loading=\"{{ !isDataLoaded.candle }}\">\r\n        <div class=\"panel-heading\">\r\n\r\n          <i class=\"icon icon-ui-info\"></i>\r\n          <h5 class=\"panel-title drilldown\">\r\n            Solar Energy Production\r\n          </h5>\r\n          <a class=\"drilldown-close\" ng-click=\"closeDrilldown()\"></a>\r\n        </div>\r\n        <!--\r\n        <div class=\"date-range-nav row\">\r\n          <div class=\"col-xs-4 text-left\">\r\n            <a ng-click=\"prevDate()\" class=\"prev-nav\"><span class=\"hidden-xs\">{{prevDateLabel}}</span></a>\r\n          </div>\r\n          <div class=\"col-xs-4 text-center\">\r\n            <span class=\"cur-nav\">{{currentDateLabel}}</span>\r\n          </div>\r\n          <div class=\"col-xs-4 text-right\">\r\n            <a ng-click=\"nextDate()\" class=\"next-nav\"><span class=\"hidden-xs\">{{nextDateLabel}}</span></a>\r\n          </div>\r\n        </div>\r\n        -->\r\n        <div class=\"panel-body\">\r\n          <div id=\"candlestickChartContainer\">\r\n            <highchart config=\"candleChartConfig\" class=\"widget candlestick-widget\"></highchart>\r\n          </div>\r\n          <div class=\"footer\">\r\n            <div class=\"kpis\">\r\n              <div class=\"kpi\">\r\n                <div class=\"kpi-title\">Total Savings</div>\r\n                <div class=\"kpi-value\">${{lastSEG.kpiData.totalSaving }}</div>\r\n              </div>\r\n              <div class=\"kpi\">\r\n                <div class=\"kpi-title\">Total Production</div>\r\n                <div class=\"kpi-value\">{{lastSEG.kpiData.totalProduction|number }}<span class=\"unit\">kWh</span></div>\r\n              </div>\r\n              <div class=\"kpi\" ng-repeat=\"source in lastSEG.kpiData.totalProductionBySources\">\r\n                <div class=\"kpi-title\">\r\n                  <span style=\"color: {{ ::source.color }};\">&#9679;</span>\r\n                  {{source.displayName}}\r\n                </div>\r\n                <div class=\"kpi-value\">\r\n                  {{source.kwh|number }}<span class=\"unit\">kwh</span>\r\n                </div>\r\n              </div>\r\n            </div>\r\n          </div>\r\n        </div>\r\n      </div>\r\n      <!-- End solar-energy-production -->\r\n    </div>\r\n    <div class=\"col-sm-4 no-padding\">\r\n      <!-- Element production-per-sources -->\r\n      <div class=\"panel\" id=\"solar-energy-production-drilldown-element-2\" as-element-show-loading=\"{{ !isDataLoaded.pie }}\">\r\n        <div class=\"panel-heading\">\r\n\r\n          <i class=\"icon icon-ui-info\"></i>\r\n          <h5 class=\"panel-title\">\r\n            Production Per Source\r\n          </h5>\r\n        </div>\r\n        <div class=\"panel-body\">\r\n          <div class=\"widget\">\r\n            <!--<highchart id=\"gpsPieChart\" config=\"pieChartConfig\" class=\"widget pie-widget\"></highchart>-->\r\n            <div id=\"gpsPieChart\" class=\"widget pie-widget\"></div>\r\n          </div>\r\n        </div>\r\n      </div>\r\n      <!-- End production-per-sources -->\r\n    </div>\r\n    <div class=\"col-sm-8 no-padding\">\r\n      <!-- Elelement generation-per-month -->\r\n      <div class=\"panel\" id=\"solar-energy-production-drilldown-element-3\" as-element-show-loading=\"{{ !isDataLoaded.table }}\">\r\n        <div class=\"panel-heading\">\r\n          <i class=\"icon icon-ui-info\"></i>\r\n          <h5 class=\"panel-title\">\r\n            Production Per Month\r\n          </h5>\r\n        </div>\r\n        <div class=\"panel-body\">\r\n          <div as-sp-list-scroll-bar class=\"row widget table-widget\" scroll-wrapper-height=\"494px\">\r\n          <table class=\"table ng-table-responsive\">\r\n            <tr class=\"\">\r\n              <th colspan=\"2\"></th>\r\n              <th ng-repeat=\"column in tableChart.columns\"><span>{{column}}</span></th>\r\n            </tr>\r\n            <tr ng-repeat=\"row in tableChart.data\">\r\n              <td colspan=\"2\"><span class=\"diff-percent\">{{row.percent}}%</span><span class=\"dimensions\">{{row.date | amDateFormat:\'MMMM, YYYY\'}}</span></td>\r\n              <td ng-repeat=\"sourceName in tableChart.sourceNames | limitTo: 5\" class=\"data\">\r\n                <span class=\"bold\">{{(row.sources[sourceName].kwh||0) | number:0 }} <span>kWh</span></span>\r\n              </td>\r\n            </tr>\r\n          </table>\r\n        </div>\r\n        </div>\r\n      </div>\r\n      <!-- End production-per-month -->\r\n    </div>\r\n  </div>\r\n</div>");
$templateCache.put("app/elements/solar-energy-production/template.html","<div class=\"panel\" id=\"solar-energy-production\" as-element-show-loading=\"{{ !isDataLoaded }}\">\r\n  <div class=\"panel-heading\">\r\n\r\n    <as-more-panel position=\"bottom left\" panel-title=\"Solar Energy Production\" classes=\"more-seg\">\r\n      <div ng-include=\"\'app/partials/more-panels/solar-energy-production.html\'\"></div>\r\n    </as-more-panel>\r\n    <h5 class=\"panel-title\">\r\n      Solar Energy Production\r\n    </h5>\r\n    <as-date-range-selector ng-model=\"dateRange\" ranges=\"week,month,year,total\"></as-date-range-selector>\r\n  </div>\r\n  <div class=\"panel-body\">\r\n    <div class=\"chart-container\">\r\n      <div class=\"date-range-nav row\">\r\n        <div class=\"col-xs-4 text-left\">\r\n          <a ng-click=\"prevDate()\" class=\"prev-nav\"><span class=\"hidden-xs\">{{prevDateLabel}}</span></a>\r\n        </div>\r\n        <div class=\"col-xs-4 text-center\">\r\n          <span class=\"cur-nav\">{{currentDateLabel}}</span>\r\n        </div>\r\n        <div class=\"col-xs-4 text-right\">\r\n          <a ng-click=\"nextDate()\" class=\"next-nav\"><span class=\"hidden-xs\">{{nextDateLabel}}</span></a>\r\n        </div>\r\n      </div>\r\n      <div id=\"segMainChartContainer\">\r\n        <highchart id=\"segMainChart\" config=\"segMainChartConfig\" class=\"widget chart-widget\"></highchart>\r\n      </div>\r\n    </div>\r\n    <div class=\"footer\">\r\n      <div class=\"kpis\">\r\n        <div class=\"kpi\">\r\n          <div class=\"kpi-title\">Total Savings</div>\r\n          <div class=\"kpi-value\">${{lastSEG.kpiData.totalSaving |number}}</div>\r\n        </div>\r\n        <div class=\"kpi\">\r\n          <div class=\"kpi-title\">Total Production</div>\r\n          <div class=\"kpi-value\">{{lastSEG.kpiData.totalProduction|number }}<span class=\"unit\">kWh</span></div>\r\n        </div>\r\n        <div class=\"kpi\" ng-repeat=\"source in lastSEG.kpiData.totalProductionBySources | limitTo: 3\">\r\n          <div class=\"kpi-title\">\r\n            <span style=\"color: {{ ::source.color }};\">&#9679;</span>\r\n            {{source.displayName}}\r\n          </div>\r\n          <div class=\"kpi-value\">\r\n            {{source.kwh|number }}<span class=\"unit\">kWh</span>\r\n          </div>\r\n        </div>\r\n      </div>\r\n    </div>\r\n  </div>\r\n</div>\r\n");
$templateCache.put("app/elements/sunhours-energy/template.html","<div class=\"element sun-hours\" id=\"sunhours-energy\">\r\n	<div class=\"header row\">\r\n		<div class=\"title col-md-6\">\r\n			<a class=\"link-more ve\" more-dialog=\"#sunhours_more\"><i class=\"icon icon-ui-info\"></i></a>						\r\n			<a href=\"javascript:void(0)\" class=\"link-detail\">Energy by Sun-Hours</a>\r\n		</div>\r\n	</div>\r\n	<div class=\"widget\">\r\n		<div class=\"col-md-2\">\r\n			<div class=\"total-label\">Total in {{currentYear}}</div>\r\n			<div class=\"total-value\">{{totalHours | number}} Hours</div>\r\n			<div class=\"sh-year-label pull-left\" ng-click=\"goPrevYear()\">\r\n				<span class=\"icon-arrow left\"></span> <span>{{prevYear}}</span>\r\n			</div>\r\n			<div class=\"sh-year-label pull-right\" ng-click=\"goNextYear()\" ng-hide=\"currentYear == fullYear\">\r\n				 <span>{{nextYear}}</span><span class=\"icon-arrow right\"></span>\r\n			</div>\r\n			<div class=\"clearfix\"></div>\r\n		</div>\r\n		<div class=\"col-md-10\">\r\n			<div id=\"calendarChart\" class=\"calendar-chart\"></div>\r\n		</div>\r\n		<div class=\"clearfix\"></div>\r\n	</div>\r\n	<div style=\"width:100%; height:200px\">\r\n	</div>\r\n	<div class=\"more\" id=\"sunhours_more\">\r\n		<div class=\"blue-box\">\r\n			<h5 class-\"title\">What are \"Sun-Hours\"?</h5>\r\n			<div class=\"row\">\r\n				<div class=\"col-md-12\">\r\n					<p>Energy is the amount  of power that is  used over  a specific time. Irradiance is the amount  of solar radiation  that is delivered to an area over a certain amount of  time. That means that for any given area, there is a specific amount of radiant power delivered to that area by the sun.</p> \r\n					<p>The amount of time that Irradiance is delivered and collected determines how much energy your solar array can harvest. This is known as “Insolation” and is calculated by taking the power multiplied by time and divided by area. </p>\r\n					<p>Insolation is used to determine an array’s “Sun Hours.” For each geographical location, and depending on the time of year, there is a certain amount of Sun Hours per day that have historically been measured at that location. Sun Hours should not be confused with the amount of hours the sun is out since the sun does not remain in the same location during the day and does not follow the same path depending on the time of year. </p>\r\n					<p>For example, the month of July in Kansas City has an average of 6.56 Sun Hours per day. Even though the sun is out for longer than 6.56 hours each day, that value is as if the sun were shining at its maximum potential. In contrast, the same location in the month of December has an average of only 1.89 Sun Hours. </p>\r\n					<p>Other factors when determining energy produced are the solar array system size, the orientation of the solar array and the tilt angle of the solar modules.</p>\r\n				</div>\r\n			</div>\r\n			<div class=\"arrow-top\"></div>\r\n		</div>\r\n	</div>\r\n</div>");
$templateCache.put("app/elements/total-energy-production/template.html","<div class=\"panel element-numeric element-atom total-energy-production\" as-element-show-loading=\"{{ !isDataLoaded }}\">\r\n	<div class=\"panel-heading\">\r\n		<as-more-panel position=\"bottom left\" panel-title=\"Total Energy Production\">\r\n			<div ng-include=\"\'app/partials/more-panels/total-energy-production.html\'\"></div>\r\n		</as-more-panel>\r\n		<h5 class=\"panel-title\">\r\n			Total Energy Production\r\n		</h5>\r\n		<as-date-range-selector ng-model=\"dateRange\" ranges=\"week,month,year,total\" force-dropdown=\"true\"></as-date-range-selector>\r\n	</div>\r\n	<div class=\"panel-body\">\r\n		<div class=\"widget\">\r\n			<div class=\"total-generation\">\r\n				<a class=\"link-info\">Total Production</a>\r\n				<div as-tooltip tooltip-text=\"infoPanelText\" tooltip-position=\"left middle\" tooltip-classes=\"kpi-tooltip\" class=\"numeric-data-wrapper\">\r\n					<span ng-bind=\"lastTEG.value\" as-animated-number compress=\"true\" data-num-decimals=\"1\" nosuffix=\"true\" class=\"numeric-data\">0</span>\r\n					<sup ng-bind=\"lastTEG.unit\">kWh</sup>\r\n				</div>\r\n			</div>\r\n		</div>\r\n	</div>\r\n</div>");
$templateCache.put("app/elements/weather-history/template.html","<div class=\"wrapper-weather-history\">\r\n    <div class=\"header\" >\r\n        <div ng-transclude></div>\r\n        <as-daterange-picker start-date=\"requestDateRange.start\" end-date=\"requestDateRange.end\" id=\"weather-history-daterange\"></as-daterange-picker>\r\n    </div>\r\n    <div class=\"content\">\r\n        <div class=\"weather-history-control\">\r\n            <ul class=\"list-selection-panel list-weather-history\">\r\n                <li ng-repeat=\"ws in weatherHistory track by $index\">\r\n                    <div class=\"inner\">\r\n                        {{ ws.date | amDateFormat: \'MMM D, YYYY\'}}\r\n                        <ul class=\"list-inline pull-right\">\r\n                            <li class=\"temperature\" as-tooltip tooltip-content-dom=\"#infoWeatherHistoryDetail\" tooltip-position=\"right bottom\" tooltip-classes=\"kpi-tooltip\">\r\n                                {{ ws.temperature.high }}° / {{ ws.temperature.low }}°\r\n                                <div id=\"infoWeatherHistoryDetail\" class=\"info-panel\">\r\n                                    <h5 class=\"title\">\r\n                                        {{ ws.city }} <br/>\r\n                                        {{ ws.date | amDateFormat: \'ddd, MMM D\'}}\r\n                                    </h5>\r\n                                    <p class=\"no-margin\">\r\n                                        High:&nbsp;\r\n                                        <span class=\"kpi\">{{ws.temperature.high}}°</span>\r\n                                    </p>\r\n                                    <p class=\"no-margin\">\r\n                                        Low:&nbsp;\r\n                                        <span class=\"kpi\">{{ws.temperature.low}}°</span>\r\n                                    </p>\r\n                                    <p class=\"no-margin\">\r\n                                        Daylight:&nbsp;\r\n                                    <span class=\"kpi\">\r\n                                        {{ws.sunTime.sunrise | amDateFormat: \'h:mm a\'}} ~ {{ws.sunTime.sunset | amDateFormat: \'h:mm a\'}}\r\n                                    </span>\r\n                                    </p>\r\n                                    <p class=\"no-margin\">\r\n                                        Humidity:&nbsp;\r\n                                        <span class=\"kpi\">{{ws.air.humidity}}%</span>\r\n                                    </p>\r\n                                    <p class=\"no-margin\">\r\n                                        Pressure:&nbsp;\r\n                                        <span class=\"kpi\">{{ws.air.pressure}} hPa</span>\r\n                                    </p>\r\n                                    <p>\r\n                                        Wind:&nbsp;\r\n                                        <span class=\"kpi\">{{ws.air.windSpeed}} mph W</span>\r\n                                    </p>\r\n                                </div>\r\n                            </li>\r\n                            <li class=\"weather-icon\">\r\n                                <i class=\"icon {{ ws.weatherIcon }}\"></i>\r\n                            </li>\r\n                        </ul>\r\n                    </div>\r\n                </li>\r\n            </ul>\r\n            <div class=\"offset\">\r\n                <p><img src=\"assets/img/ajax-loader-sp.gif\" width=\"20px\" height=\"20px\" align=\"middle\"/>&nbsp; Loading.... </p>\r\n            </div>\r\n        </div>\r\n    </div>\r\n</div>");
$templateCache.put("app/elements/yield-comparison/template.html","<div class=\"panel\" id=\"annual-comparison\" as-element-show-loading=\"{{ !isDataLoaded }}\">\r\n	<div class=\"panel-heading\">\r\n		<as-more-panel position=\"top left\" panel-title=\"Annual Energy Production Comparison\">\r\n			<div ng-include=\"\'app/partials/more-panels/yield-comparison.html\'\"></div>\r\n		</as-more-panel>\r\n		<h5 class=\"panel-title\">\r\n			Annual Energy Production Comparison\r\n		</h5>\r\n	</div>\r\n	<div class=\"panel-body\">\r\n		<div class=\"widget\">\r\n			<div class=\"chart-container\">\r\n				<highchart id=\"annualComboChart\" config=\"yieldChartConfig\"></highchart>\r\n			</div>\r\n		</div>\r\n	</div>\r\n</div>");
$templateCache.put("app/partials/more-panels/actual-predicted-energy.html","<p>It\'s important to be able to see your system\'s energy production and know why it is over- or under-producing. Much like the weather, it\'s difficult to predict, but - using weather patterns and data from the U.S. Department of Energy (via NREL) - we are able to determine estimated energy yields.</p>\r\n<p>There are many factors that can play into why your system is producing more or less than expected, which is why we try to be conservative when estimating how much energy a system will produce. Systems tend to underproduce their expected yields in the winter, and overproduce in the summer. During the winter, we have shorter days (meaning less sun) and can also have snow cover. The opposite is true in the summer: instead we have longer days, and no snow.</p>");
$templateCache.put("app/partials/more-panels/avoided-carbon.html","<p>Fossil-based fuels such as gas, oil, and coal produce greenhouse gas emissions as they are converted to energy - as does your car as it burns gas to run. Generally speaking, one kWh from the U.S. power grid produces 15.2 lbs of CO2.  calculated by eGrid (Emissions & Generation Resource Integrated Database), this is known as the Emissions Factor.</p>\r\n<p>Because solar is a carbon-free energy source, every kilowatt hour of solar energy you produce is also reducing - or avoiding - the amount of carbon emissions being released into our atmosphere as a result of power generation.</p>\r\n<p>These emissions are measured in pounds and tons - and because they\'re a more abstract concept, we frequently use Environmental Equivalencies to relate those abstract terms to more everyday, concrete terms.</p>");
$templateCache.put("app/partials/more-panels/current-weather.html","<p>\r\n    Current Weather shows the current weather of first selected facility\r\n</p>");
$templateCache.put("app/partials/more-panels/equivalencies.html","<p>What does Avoided Carbon mean in everyday terms? These equivalencies are meant to translate the abstract measurements of pounds of CO2 or greenhouse gas emissions into much more concrete, relatable terms.</p>\r\n<p>Generally speaking, one kWh from the U.S. power grid produces 15.2 lbs of CO2.  calculated by eGrid (Emissions & Generation Resource Integrated Database), this is known as the Emissions Factor.</p>\r\n<p>Fossil-based fuels such as gas, oil, and coal produce greenhouse gas emissions as they are converted to energy - as does your car as it burns gas to run. Likewise, plants absorb CO2 as part of their photosynthesis process. So we can use the Emissions Factor to compare the energy produced by your solar array to the CO2 produced or consumed by something else.</p>\r\n");
$templateCache.put("app/partials/more-panels/power-plant-detail.html","<p>The Power Plant Details provide site-specific information regarding your system.</p>\r\n<p>The Commissioning Date is the date your system was first turned on, or energized.</p>\r\n<p>Potential Power is the total capacity, in kW, of the physical solar-energy system and is dependent on system design. This number comes from the total DC (direct current) rating of the solar panels in your system.</p>\r\n<p>Total Energy Produced is the true total production, measured in kWh, reported by your system since its Commissioning Date. This total is a lump sum of all produced energy that has passed through the system�s inverters, regardless of whether or not a daily/hourly total was recorded.</p>");
$templateCache.put("app/partials/more-panels/power-vs-energy.html","<!--\r\n<p>Simply stated, energy is <i>the capacity to do work</i>. If work is the act of <i>exerting a force over a distance,</i> like pushing a chair across the room or lifting a fork to your mouth, then energy is what makes it possible to push those things around - whether those things be a chair or an electron in a light bulb. When we talk about electric energy, we use a couple of different units to measure that energy: watt hours (Wh), kilowatt hours (kWh), and Megawatt-hours (MWh).</p>\r\n<p>One watt of electrical power, maintained for one hour, equals one watt-hour of energy. One thousand watts of electrical power, maintained for one hour, is a kilowatt hour. One million watts of electrical power, maintained for one hour, is a Megawatt hour.</p>\r\n<p>While energy measures the total quantity of work done, it doesn’t say how fast you can get the work done. Power, though, is the <i>rate of generating or consuming energy </i> - or energy per unit of time - and is measured in Watts or Kilowatts. For example, you can move a loaded car across the country with a moped engine - but the car’s larger engine, equipped with more power, would do the same amount of work, only in far less time.</p>\r\n<p>How much total <i>energy</i> can your system produce? Think kilowatt hours.</p>\r\n<p>How much <i>power</i> can it deliver - or generate - at any moment? Think kilowatts.</p>\r\n-->\r\n<!--<p>\r\n    If electricity were water, then power is gallons per minute, which goes to zero when you turn off the tap. Energy is total gallons consumed.\r\n</p>\r\n<div class=\"row\" style=\"margin: 0 0 15px;\">\r\n    <div class=\"col-md-6 no-padding\">\r\n        <div class=\"wrapper-kpi light right-meter\">\r\n            <as-meter-bar min=\"powerInfo.minAvg\" max=\"powerInfo.maxAvg\" ng-model=\"powerInfo.current\"></as-meter-bar>\r\n            <div class=\"numeric-content\">\r\n                <span class=\"kpi-value\"><b ng-bind=\"powerInfo.current\">0</b><sup>kW</sup></span>\r\n                <span class=\"kpi-title\">Current Power</span>\r\n            </div>\r\n        </div>\r\n    </div>\r\n    <div class=\"col-md-6\"><p>Power - measured in Watts (W) or Kilowatts (kW) - is like your speedometer. Your speedometer shows your current speed</p></div>\r\n</div>\r\n<div class=\"row\" style=\"margin: 0 0 15px;\">\r\n    <div class=\"col-md-6 no-padding\">\r\n        <div class=\"wrapper-kpi light right-meter\">\r\n            <as-meter-bar min=\"energyInfo.minAvg\" max=\"energyInfo.maxAvg\" ng-model=\"energyInfo.today\"></as-meter-bar>\r\n            <div class=\"numeric-content\">\r\n                <span class=\"kpi-value\"><b ng-bind=\"energyInfo.today\">0</b><sup>kWh</sup></span>\r\n                <span class=\"kpi-title\">Today\'s Energy</span>\r\n            </div>\r\n        </div>\r\n    </div>\r\n    <div class=\"col-md-6\"><p>Energy - measured in Watt-Hours (Wh) or Kilowatt-Hours (kWh) - is like your odometer. Your odometer shows how far that speed took you over time</p></div>\r\n</div>\r\n<p>\r\n    Your current power is <span class=\"kpi\">{{ powerInfo.current }}kW</span>.\r\n    It’s <as-current-time format=\"h:mma\"></as-current-time> on a {{ todayWeather.summary | lowercase }} day and your system’s peak production capability is <span class=\"kpi\" ng-bind=\"powerInfo.potential + \'kW\'\">0kW</span>.\r\n    If it weren’t for the clouds, you would be producing more power.\r\n</p>\r\n-->\r\n<p>How much total energy can your system produce? Think kilowatt hours.</p>\r\n<p>How much power can it deliver - or generate - at any moment? Think kilowatts.</p>\r\n<div class=\"row\" style=\"margin: 0 0 15px;\">\r\n    <div class=\"col-md-6 no-padding\">\r\n        <div class=\"wrapper-kpi light right-meter\">\r\n            <as-meter-bar min=\"energyInfo.minAvg\" max=\"energyInfo.maxAvg\" ng-model=\"energyInfo.today\"></as-meter-bar>\r\n            <div class=\"numeric-content\">\r\n                <span class=\"kpi-value\"><b ng-bind=\"energyInfo.today\">0</b><sup>kWh</sup></span>\r\n                <span class=\"kpi-title\">Today\'s Energy</span>\r\n            </div>\r\n        </div>\r\n    </div>\r\n    <div class=\"col-md-6\"><p>Energy is the capacity to do work. If work is the act of exerting a force over a distance, like pushing a chair across the room.</p></div>\r\n</div>\r\n<div class=\"row\" style=\"margin: 0 0 15px;\">\r\n    <div class=\"col-md-6 no-padding\">\r\n        <div class=\"wrapper-kpi light right-meter\">\r\n            <as-meter-bar min=\"powerInfo.minAvg\" max=\"powerInfo.maxAvg\" ng-model=\"powerInfo.current\"></as-meter-bar>\r\n            <div class=\"numeric-content\">\r\n                <span class=\"kpi-value\"><b ng-bind=\"powerInfo.current\">0</b><sup>kW</sup></span>\r\n                <span class=\"kpi-title\">Current Power</span>\r\n            </div>\r\n        </div>\r\n    </div>\r\n    <div class=\"col-md-6\"><p>Power, though, is the rate of generating or consuming energy - or energy per unit of time - and is measured in Watts or Kilowatts.</p></div>\r\n</div>\r\n<p>\r\n    For example, you can move a loaded car across the country with a moped engine - but the car’s larger engine, equipped with more power, would do the same amount of work, only in far less time.\r\n</p>\r\n");
$templateCache.put("app/partials/more-panels/real-time-power.html","<p>Real-Time Max Power is the rate that electricity is generated at a given time by a solar-energy system. This amount depends on the maximum power capacity available, relative to the sun\'s intensity at that given time.</p>");
$templateCache.put("app/partials/more-panels/savings.html","<p>The financial savings from your solar system(s) is calculated by multiplying your estimated utility rate ($0.10 cents per kWh) by the solar system(s) energy production.</p>\r\n<p class=\"bottom\">For purposes of estimating energy savings, the utility rate is estimated based on averages in your area. The actual energy savings will vary depending on your utility’s specific tariff structure that often includes charges based on a combination of monthly peak demand (measured in kW) and consumption (measured in kWh).</p>");
$templateCache.put("app/partials/more-panels/solar-energy-production.html","<div class=\"row\">\r\n    <div class=\"col-sm-8\">\r\n        <p>Your solar panels produce DC (direct current)  electricity, which is then sent to your inverters where it is converted to AC (alternating current) electricity that your facility is able to use.</p>\r\n    </div>\r\n</div>\r\n<div class=\"row\">\r\n    <div class=\"col-sm-7 padding-top-10\">\r\n        <div class=\"img-how-solar-work\"></div>\r\n    </div>\r\n    <div class=\"col-sm-5 padding-top-50\">\r\n        <p>1. Solar panels absorb sunlight and convert it to DC electricity.</p>\r\n        <p>2. DC electricity from the solar panels travels to the inverters where it is converted to AC electricity.</p>\r\n        <p>3. From the inverter, AC electricity passes to the electric service panel (breaker box) where it\'s routed to power your building.</p>\r\n        <p class=\"bottom\">4. When your solar system generates more power than your building is consuming, excess electricity is routed to the power grid. This earns credits on you bill (called net-metering).</p>\r\n    </div>\r\n</div>");
$templateCache.put("app/partials/more-panels/sources-power-plant-detail.html","<p>The Power Plant Details provide site-specific information regarding your system.</p>\r\n<p>The Commissioning Date is the date your system was first turned on, or energized.</p>\r\n<p>Potential Power is the total capacity, in kW, of the physical solar-energy system and is dependent on system design. This number comes from the total DC (direct current) rating of the solar panels in your system.</p>\r\n<p>Total Energy Produced is the true total production, measured in kWh, reported by your system since its Commissioning Date. This total is a lump sum of all produced energy that has passed through the system\'s inverters, regardless of whether or not a daily/hourly total was recorded.</p>");
$templateCache.put("app/partials/more-panels/total-energy-production.html","<p class=\"bottom\">The Total Energy Production is the cumulative amount of electricity produced by your system over a given time period.  This value is influenced by many factors, including shading (trees, snow, other buildings, etc.), the change in angle of the sun in the sky throughout the year, the tilt degree of the panels, and changing weather patterns.</p>\r\n\r\n");
$templateCache.put("app/partials/more-panels/yield-comparison.html","<p>When comparing your solar-energy system\'s current production to previous years\', you will always see variance: no two days are exactly the same when it comes to weather, let alone years. And variances in weather year-to-year can have a profound effect on levels of energy production.</p>\r\n<p>For example, if last February was brutally cold and you experienced heavy snows, chances are that solar production was low for that month. If, in contrast, this year\'s winter has been milder, then you\'ll most likely see a significant bump in production when comparing month-over-month (Feb vs Feb).</p>\r\n<p>Its important to remember that when comparing one month or year to another that although there may be short-term peaks and valleys, the longer your system is on, the closer to its expected production it gets. The estimated yields may not look accurate on a day-to-week or even month basis, but when you compare years, it begins to be much more predictable.</p>");}]);
//# sourceMappingURL=maps/app.min.js.map