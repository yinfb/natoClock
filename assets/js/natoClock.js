(function(window, angular, $) {

  var NatoClock = function(canvas, config) {
    config = config || {};
    var frame = 100 / 60;
    var width = config.width || 500,
        height = config.height || 500,
        color = config.color || '#fefefe',
        colors = config.colors || {},
        background = config.background || '#333',
        txtcolor = config.txtcolor || 'rgba(255,255,255,0.5)',
        acceleration = config.acceleration || 2.5,
        dpiScale = config.dpiScale || 1,
        bounces = config.bounces || false,
        targets = config.targets || ['min', 'hrs', 'day', 'week', 'mon', 'yrs'],
        outerRadius = config.outerRadius || 275,
        showPercentage = config.showPercentage || false,
        statusFont = config.statusFont || 'Monaco',
        labelFont = config.labelFont || 'Monaco',
        showFps = config.showFps || false,
        maxFps = config.maxFps || 60;

    var rafid, raf_available;
    var startTime, frameCount = 0, fps = 0;

    /* DateUtil: extented date */
    var DateUtil = function (d) {
      this.getSeconds = function () {
        return d.getSeconds();
      }

      this.isLeapYear = function () {
        var year = d.getFullYear();
        if((year & 3) != 0) return false;
        return ((year % 100) != 0 || (year % 400) == 0);
      };

      this.getYearDays =  function () {
        return this.isLeapYear() ? 366 : 365;
      };

      this.getMonthDays = function () {
        var _d = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        return _d.getDate();
      };

      this.getDayOfYear = function() {
        var dayCount = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
        var mn = d.getMonth();
        var dn = d.getDate();
        var dayOfYear = dayCount[mn] + dn;
        if(mn > 1 && this.isLeapYear()) dayOfYear++;
        return dayOfYear;
      };

      this.getMillisecondsOfMinutes = function () {
        return d.getMilliseconds() + 1000 * d.getSeconds() - 1;
      };

      this.getSecondsOfHour = function() {
        return d.getSeconds() + 60 * d.getMinutes();
      };

      this.getSecondsOfDay = function() {
        return d.getSeconds() + (60 * d.getMinutes()) + (3600 * d.getHours());
      };

      this.getSecondsOfWeek = function() {
        var day = d.getDay();
        day = (day == 0 ? 7 : day);
        return this.getSecondsOfDay() + 86400 * (day - 1);
      };

      this.getSecondsOfMonth = function() {
        return this.getSecondsOfDay() + 86400 * (d.getDate() - 1);
      };

      this.getSecondsOfYear = function () {
        return this.getSecondsOfDay() + 86400 * (this.getDayOfYear() - 1);
      };

      this.percentOf = function(unit) {
        var percent = function(part, full) { return part == 0 ? 0 : (full/part) };
        if (unit == 'min') return percent(60000, d.getMilliseconds() + 1000 * d.getSeconds());
        if (unit == 'hrs') return percent(3600, this.getSecondsOfHour());
        if (unit == 'day') return percent(3600 * 24, this.getSecondsOfDay());
        if (unit == 'week') return percent(86400 * 7, this.getSecondsOfWeek());
        if (unit == 'mon') return percent(this.getMonthDays() * 86400, this.getSecondsOfMonth());
        if (unit == 'yrs') return percent(this.getYearDays() * 86400, this.getSecondsOfYear());
      };

      this.isFinished = function (unit) {
        if (unit == 'min') return (d.getSeconds() >= 59 && d.getMilliseconds() >= 950);
        if (unit == 'hrs') return (this.getSecondsOfHour() >= 3599 && d.getMilliseconds() >= 950);
        if (unit == 'day') return (this.getSecondsOfDay() >= 86399 && d.getMilliseconds() >= 950);
        if (unit == 'week') return (this.getSecondsOfWeek() >= 604799 && d.getMilliseconds() >= 950);
        if (unit == 'mon') return (this.getSecondsOfMonth() >= ((this.getMonthDays() * 86400) - 1) && d.getMilliseconds() >= 950);
        if (unit == 'yrs') return (this.getSecondsOfYear() >= ((this.getYearDays() * 86400) - 1) && d.getMilliseconds() >= 950);
      };

      return this;
    };

    /* requestAnimationFrame related works. */
    var getRaf = function () {
      var _raf = requestAnimationFrame || webkitRequestAnimationFrame || oRequestAnimationFrame || msRequestAnimationFrame;
      raf_available = _raf ? true : false;
      return _raf || function(func) {
        return window.setTimeout(func, 1000 / (config.noRafFps || 60));
      }
    };
    var raf = getRaf();

    /* get DOM element, and build our canvas */
    var ctx = canvas.getContext('2d');

    width = width * dpiScale;
    height = height * dpiScale;

    var minE = width > height ? height : width;

    canvas.width = width;
    canvas.height = height;

    if(dpiScale != 1) {
      canvas.style.width = width/dpiScale;
      canvas.style.height = height/dpiScale;
    }

    /* Grapher: Graph our arc! */
    var Grapher = function(arc) {
      var shiftX = width/2,
          shiftY = height/2,
          rot = arc.getRot();

      /* Arc Bar */
      ctx.beginPath();
      ctx.arc(shiftX, shiftY, arc.r, (Math.PI/(2/3)), rot, false);
      ctx.lineWidth = minE/20;
      ctx.strokeStyle = arc.color;
      ctx.stroke();
      ctx.save();

      /* Status text */
      if (showPercentage) {
        ctx.fillStyle = background;
        ctx.translate(shiftX, shiftY);
        ctx.rotate(rot);
        ctx.font = ((14/600) * minE) + 'px ' + statusFont;
        var d = new DateUtil(new Date()),
            p = d.percentOf(arc.class) * 100 | 0,
            tS = (minE/20 - ctx.measureText(p).width)/2;
        if(p > 0) ctx.fillText(p, arc.r - minE/40 + tS, (-5/600) * minE);
        ctx.restore();
      }

    }

    var Labeler = function (arcs) {
      ctx.font = ((11/600) * minE) + 'px ' + labelFont;
      ctx.fillStyle = txtcolor;
      var maxWidth = 0;
      for (var i = 0; i < arcs.length; i++) {
        var w = ctx.measureText(arcs.class).width;
        maxWidth = w > maxWidth ? w : maxWidth;
      }
      arcs.forEach(function (arc) {
        var name = arc.class,
            lft = width/2 - maxWidth/4 - ctx.measureText(name).width;
        ctx.fillText(name, lft, minE/2 - arc.r + 4/600 * minE);
      });
    }

    /* arc constructor: build our arcs! */
    var Arc = function (_config) {
      var unit = _config.class,
          r = _config.radius,
          color = _config.color,
          percent = 0,
          k = 0,
          g = acceleration,
          goBack = false;
      var update = function () { // code from @ljyloo, @magicnat edited.
        var d = new DateUtil(new Date());
        var newPercent = d.percentOf(unit) * 100;
         if (d.isFinished(unit) && bounces) goBack = true;
         if (goBack) {
           k += frame;
           var de = (k / 100) * (k / 100) * g;
           if ((percent - de) > 0.1)
             percent -= de;
           else {
             if (d.getSeconds() > 0){
               k = 0;
               percent = newPercent;
               goBack = false;
             }
             else percent = 0.1;
           }
         }
         else percent = newPercent;
      }
      getRot = function () {
        update();
        return percent * 0.01 * (Math.PI * 2) - (Math.PI / 2);
      }
      return {
        getRot: getRot,
        class: unit,
        color: color,
        r: r
      };
    }

    var reset = function () {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
    }

    var draw = function(time) {
      reset();

      if(config.showFps) {
        ctx.font = ((11/600) * minE) + 'px Monaco';
        ctx.fillStyle = txtcolor;
        ctx.fillText((fps|0) + ' fps (' + frameCount + ' frames in ' + (time|0) + ' ms), limit ' + maxFps + ' fps.', .02 * minE, .03 * minE);
      }
      Labeler(bars);
      bars.map(Grapher);
    }

    var now, then = Date.now(), interval = 1000/maxFps, delta;

    var mainloop = function() {
      /* Frame Rate is not always 60. This makes bounces unpredictable.
       * so we need to measure frame rate.
       * why not DOMHighResTimeStamp? cuz even if we re-construct NatoClock
       * object, the time given by raf call was since the first one.
       * Also, what if we have other raf there?
       */

      rafid = raf(mainloop);

      // TODO: what if browser stop animate it self? need some way to calcutale real FPS rather then getting an average.

      now = Date.now();
      delta = now - then;

      if (delta > interval) {
        then = now - (delta % interval);

        frameCount++;
        time = Date.now() - startTime;
        fps = frameCount*1000/time;
        frame = 100/fps;
        draw(time);
      }
    }

    var stop = function() {
      if(raf_available) window.cancelAnimationFrame(rafid);
      else window.clearTimeout(rafid);
    }

    var destroy = function() {
      stop();
      reset();
    };

    var bars = [];

    var arcGen = function () {

      var _radius = outerRadius + 35;

      for(var i = 0; i < targets.length; i++) {
        var target = targets[i],
            radius = (_radius -= 35);
        bars.push(new Arc({
          class: target,
          radius: (radius/600) * minE,
          color: colors[target] || color
        }));
      }

    };

    arcGen();
    mainloop();

    startTime = Date.now();

    return {
      stop: stop,
      destroy: destroy,
    };
  };

  if($) { // well, jQuery. Register anyway.
    $.prototype.NatoClock = function(conf) {
      $(this).each(function(i, v) {
        NatoClock(v, conf);
      });
    };
    return this;
  }

  if(angular) { // we have angular! let's register ourself.
    angular
      .module('NatoClock', [])
      .directive('natoClock', function() {
        return {
          template: '<canvas></canvas>',
          restrict: 'E',
          scope: {cfg: "=ncCfg"},
          link: function($scope, $element) {
            NatoClock($element[0].children[0], $scope.cfg);
          }
        }
      });
  }

  window.NatoClock = NatoClock;

})(window, window.angular, window.jQuery)
