/*
 countUp.js
 Originally created by @inorganik
 Modified by Ivan Vesely(ivan.jan.vesely@gmail.com)
 Add some brighterlink specific compressMode;
 32342 -> 32.3k
 531321 -> 531k
 1645244 -> 1.6m
 */

// target = id of html element or var of previously selected html element where counting occurs
// startVal = the value you want to begin at
// endVal = the value you want to arrive at
// decimals = number of decimal places, default 0
// duration = duration of animation in seconds, default 2
// options = optional object of options (see below)

var compressNumber = function (number) {
  if (number > 1000000) {
//    return 2890 + parseInt((number-1000000)/100000);
    return 2890 + ((number-1000000)/100000);
  }
  if (number > 100000) {
//    return 1000 + 990 + parseInt((number-100000)/1000);
    return 1000 + 990 + ((number-100000)/1000);
  }
  if (number > 1000) {
//    return 1000 + parseInt((number-1000)/100);
    return 1000 + ((number-1000)/100);
  }
  return number;
};

var decompressNumber = function (number) {
  if (number > 2890) {
    return (number - 2890)*100000 + 1000000;
  }
  if (number > 1000 + 990) {
    return (number - 1990)*1000 + 100000;
  }
  if (number > 1000) {
    return (number - 1000)*100 + 1000;
  }
  return number;
};

function countUp(target, startVal, endVal, decimals, duration, options) {

  // make sure requestAnimationFrame and cancelAnimationFrame are defined
  // polyfill for browsers without native support
  // by Opera engineer Erik Möller
  var lastTime = 0;
  var vendors = ['webkit', 'moz', 'ms', 'o'];
  for(var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
    window.requestAnimationFrame = window[vendors[x]+'RequestAnimationFrame'];
    window.cancelAnimationFrame =
      window[vendors[x]+'CancelAnimationFrame'] || window[vendors[x]+'CancelRequestAnimationFrame'];
  }
  if (!window.requestAnimationFrame) {
    window.requestAnimationFrame = function(callback, element) {
      var currTime = new Date().getTime();
      var timeToCall = Math.max(0, 16 - (currTime - lastTime));
      var id = window.setTimeout(function() { callback(currTime + timeToCall); },
        timeToCall);
      lastTime = currTime + timeToCall;
      return id;
    };
  }

  if (!window.cancelAnimationFrame) {
    window.cancelAnimationFrame = function(id) {
      clearTimeout(id);
    };
  }

  // default options
  this.options = options || {
    useEasing : true, // toggle easing
    useCompress: false, // 99200 -> 99.2k
    useGrouping : true, // 1,000,000 vs 1000000
    separator : ',', // character to use as a separator
    decimal : '.' // character to use as a decimal
  };

  if (this.options.separator === '') { this.options.useGrouping = false; }
  if (!this.options.prefix) { this.options.prefix = ''; }
  if (!this.options.suffix) { this.options.suffix = ''; }
  if (this.options.useCompress && !this.options.compressSuffix) {
    this.options.compressSuffix = ['k', 'm'];
  }

  var self = this;

  this.d = (typeof target === 'string') ? document.getElementById(target) : target;
  this.startVal = Number(startVal);
  this.endVal = Number(endVal);

  if (this.options.useCompress) {
    this.startVal = compressNumber(this.startVal);
    this.endVal = compressNumber(this.endVal);
  }

  this.countDown = (this.startVal > this.endVal) ? true : false;
  this.startTime = null;
  this.timestamp = null;
  this.remaining = null;
  this.frameVal = this.startVal;
  this.rAF = null;
  this.decimals = Math.max(0, decimals || 0);
  this.dec = Math.pow(10, this.decimals);
  this.duration = duration * 1000 || 2000;

  this.version = function () { return '1.3.3'; }

  // Print value to target
  this.printValue = function(value) {
    var result = (!isNaN(value)) ? self.formatNumber(value) : '--';
    if (self.d.tagName === 'INPUT') {
      this.d.value = result;
    }
    else if (self.d.tagName === 'text') {
      this.d.textContent = result;
    }
    else {
      this.d.innerHTML = result;
    }
  };

  // Robert Penner's easeOutExpo
  // t: current time, b: begInnIng value, c: change In value, d: duration
  this.easeOutExpo = function(t, b, c, d) {
    return c * (-Math.pow(2, -10 * t / d) + 1) * 1024 / 1023 + b;
  };

  this.count = function(timestamp) {

    if (self.startTime === null) { self.startTime = timestamp; }

    self.timestamp = timestamp;

    var progress = timestamp - self.startTime;
    self.remaining = self.duration - progress;

    // to ease or not to ease
    if (self.options.useEasing) {
      if (self.countDown) {
        var i = self.easeOutExpo(progress, 0, self.startVal - self.endVal, self.duration);
        self.frameVal = self.startVal - i;
      } else {
        self.frameVal = self.easeOutExpo(progress, self.startVal, self.endVal - self.startVal, self.duration);
      }
    } else {
      if (self.countDown) {
        var i = (self.startVal - self.endVal) * (progress / self.duration);
        self.frameVal = self.startVal - i;
      } else {
        self.frameVal = self.startVal + (self.endVal - self.startVal) * (progress / self.duration);
      }
    }

    // don't go past endVal since progress can exceed duration in the last frame
    if (self.countDown) {
      self.frameVal = (self.frameVal < self.endVal) ? self.endVal : self.frameVal;
    } else {
      self.frameVal = (self.frameVal > self.endVal) ? self.endVal : self.frameVal;
    }

    // decimal
    self.frameVal = Math.round(self.frameVal*self.dec)/self.dec;

    // format and print value
    self.printValue(self.frameVal);

    // whether to continue
    if (progress < self.duration) {
      self.rAF = requestAnimationFrame(self.count);
    } else {
      if (self.callback) { self.callback(); }
    }
  };

  this.start = function(callback) {
    self.callback = callback;
    // make sure values are valid
    if (!isNaN(self.endVal) && !isNaN(self.startVal)) {
      self.rAF = requestAnimationFrame(self.count);
    } else {
      console.log('countUp error: startVal or endVal is not a number');
      self.printValue();
    }
    return false;
  };

  this.stop = function() {
    cancelAnimationFrame(self.rAF);
  };

  this.reset = function() {
    self.startTime = null;
    self.startVal = startVal;
    cancelAnimationFrame(self.rAF);
    self.printValue(self.startVal);
  };

  this.resume = function() {
    self.stop();
    self.startTime = null;
    self.duration = self.remaining;
    self.startVal = self.frameVal;
    requestAnimationFrame(self.count);
  };

  this.update = function (newEndval) {
    self.stop();
    self.startTime = null;
    self.startVal = self.endVal;
    self.endVal = Number(newEndval);
    self.countDown = (self.startVal > self.endVal) ? true : false;
    self.rAF = requestAnimationFrame(self.count);
  };

  this.formatNumber = function(nStr) {

    if (this.options.useCompress) {

      var decompressed = decompressNumber(nStr);
      return this.shortNumber(decompressed);

    } else {
      nStr = nStr.toFixed(self.decimals);
      nStr += '';
      var x, x1, x2, rgx;
      x = nStr.split('.');
      x1 = x[0];
      x2 = x.length > 1 ? self.options.decimal + x[1] : '';
      rgx = /(\d+)(\d{3})/;
      if (self.options.useGrouping) {
        while (rgx.test(x1)) {
          x1 = x1.replace(rgx, '$1' + self.options.separator + '$2');
        }
      }
      return self.options.prefix + x1 + x2 + self.options.suffix;
    }
  };

  this.shortNumber = function (input) {
    var decimals = this.decimals;
    var number = parseFloat(input);
    if (number < 1) {
      number = number.toFixed(decimals);
      return number;
    }
    number = parseFloat(input).toFixed(decimals);
    if (number >= 1000000000) {
      number = (number / 1000000).toFixed(decimals).toLocaleString() + this.options.compressSuffix[1];
    } else if (number >= 1000000) {
      number = (number / 1000000).toFixed(decimals).toLocaleString() + this.options.compressSuffix[1];
    } else if (number >= 100000) {
      number = (number / 1000).toFixed(decimals).toLocaleString() + this.options.compressSuffix[0];
    } else if (number >= 1000) {
      number = (number / 1000).toFixed(decimals).toLocaleString() + this.options.compressSuffix[0];
    } else if (number < 1) {
      number = number.toFixed(decimals);
    }

    return number;
  };

  // format startVal on initialization
  self.printValue(self.startVal);
}

// Example:
// var numAnim = new countUp("SomeElementYouWantToAnimate", 0, 99.99, 2, 2.5);
// numAnim.start();
// numAnim.update(135);
// with optional callback:
// numAnim.start(someMethodToCallOnComplete);