/**
 * CraftLanee Pay - Universal Drop-in Client SDK (youpi.js / craftlanee-pay.js)
 * Production-ready zero-dependency client integration script.
 * Dynamically renders according to active Plug-and-Play Modules & Checkout Studio customization.
 * Hardened for DOM XSS prevention, Cross-Origin gateway detection, and memory-safe timer cleanup.
 */

(function (window) {
  'use strict';

  if (window.__CRAFTLANEE_YOUPI_LOADED__) return;
  window.__CRAFTLANEE_YOUPI_LOADED__ = true;

  // ── 1. Embedded Pure JavaScript ISO/IEC 18004 QR Generator ────────────────
  var qrcodeLib = (function () {
    function qrcode(typeNumber, errorCorrectionLevel) {
      var PAD0 = 0xec, PAD1 = 0x11;
      var _typeNumber = typeNumber;
      var _errorCorrectionLevel = QRErrorCorrectionLevel[errorCorrectionLevel];
      var _modules = null;
      var _moduleCount = 0;
      var _dataCache = null;
      var _dataList = [];
      var _this = {};

      var makeImpl = function (test, maskPattern) {
        _moduleCount = _typeNumber * 4 + 17;
        _modules = (function (t) {
          var r = new Array(t);
          for (var e = 0; e < t; e++) {
            r[e] = new Array(t);
            for (var n = 0; n < t; n++) r[e][n] = null;
          }
          return r;
        })(_moduleCount);

        setupPositionProbePattern(0, 0);
        setupPositionProbePattern(_moduleCount - 7, 0);
        setupPositionProbePattern(0, _moduleCount - 7);
        setupPositionAdjustPattern();
        setupTimingPattern();
        setupTypeInfo(test, maskPattern);
        if (_typeNumber >= 7) setupTypeNumber(test);
        if (_dataCache == null) _dataCache = createData(_typeNumber, _errorCorrectionLevel, _dataList);
        mapData(_dataCache, maskPattern);
      };

      var setupPositionProbePattern = function (row, col) {
        for (var r = -1; r <= 7; r++) {
          if (row + r <= -1 || _moduleCount <= row + r) continue;
          for (var c = -1; c <= 7; c++) {
            if (col + c <= -1 || _moduleCount <= col + c) continue;
            if ((0 <= r && r <= 6 && (c == 0 || c == 6)) || (0 <= c && c <= 6 && (r == 0 || r == 6)) || (2 <= r && r <= 4 && 2 <= c && c <= 4)) {
              _modules[row + r][col + c] = true;
            } else {
              _modules[row + r][col + c] = false;
            }
          }
        }
      };

      var setupTimingPattern = function () {
        for (var r = 8; r < _moduleCount - 8; r++) {
          if (_modules[r][6] != null) continue;
          _modules[r][6] = (r % 2 == 0);
        }
        for (var c = 8; c < _moduleCount - 8; c++) {
          if (_modules[6][c] != null) continue;
          _modules[6][c] = (c % 2 == 0);
        }
      };

      var setupPositionAdjustPattern = function () {
        var pos = QRUtil.getPatternPosition(_typeNumber);
        for (var i = 0; i < pos.length; i++) {
          for (var j = 0; j < pos.length; j++) {
            var row = pos[i];
            var col = pos[j];
            if (_modules[row][col] != null) continue;
            for (var r = -2; r <= 2; r++) {
              for (var c = -2; c <= 2; c++) {
                if (r == -2 || r == 2 || c == -2 || c == 2 || (r == 0 && c == 0)) {
                  _modules[row + r][col + c] = true;
                } else {
                  _modules[row + r][col + c] = false;
                }
              }
            }
          }
        }
      };

      var setupTypeNumber = function (test) {
        var bits = QRUtil.getBCHTypeNumber(_typeNumber);
        for (var i = 0; i < 18; i++) {
          var mod = (!test && ((bits >> i) & 1) == 1);
          _modules[Math.floor(i / 3)][(i % 3) + _moduleCount - 8 - 3] = mod;
          _modules[(i % 3) + _moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
        }
      };

      var setupTypeInfo = function (test, maskPattern) {
        var data = (_errorCorrectionLevel << 3) | maskPattern;
        var bits = QRUtil.getBCHTypeInfo(data);
        for (var i = 0; i < 15; i++) {
          var mod = (!test && ((bits >> i) & 1) == 1);
          if (i < 6) _modules[i][8] = mod;
          else if (i < 8) _modules[i + 1][8] = mod;
          else _modules[_moduleCount - 15 + i][8] = mod;

          if (i < 8) _modules[8][_moduleCount - i - 1] = mod;
          else if (i < 9) _modules[8][15 - i - 1 + 1] = mod;
          else _modules[8][15 - i - 1] = mod;
        }
        _modules[_moduleCount - 8][8] = !test;
      };

      var mapData = function (data, maskPattern) {
        var inc = -1, row = _moduleCount - 1, bitIndex = 7, byteIndex = 0;
        var maskFunc = QRUtil.getMaskFunction(maskPattern);
        for (var col = _moduleCount - 1; col > 0; col -= 2) {
          if (col == 6) col--;
          while (true) {
            for (var c = 0; c < 2; c++) {
              if (_modules[row][col - c] == null) {
                var dark = false;
                if (byteIndex < data.length) dark = (((data[byteIndex] >>> bitIndex) & 1) == 1);
                var mask = maskFunc(row, col - c);
                if (mask) dark = !dark;
                _modules[row][col - c] = dark;
                bitIndex--;
                if (bitIndex == -1) { byteIndex++; bitIndex = 7; }
              }
            }
            row += inc;
            if (row < 0 || _moduleCount <= row) { row -= inc; inc = -inc; break; }
          }
        }
      };

      var createData = function (typeNumber, errorCorrectionLevel, dataList) {
        var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectionLevel);
        var buffer = QRBitBuffer();
        for (var i = 0; i < dataList.length; i++) {
          var data = dataList[i];
          buffer.put(data.getMode(), 4);
          buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber));
          data.write(buffer);
        }
        var totalDataCount = 0;
        for (var i = 0; i < rsBlocks.length; i++) totalDataCount += rsBlocks[i].dataCount;
        if (buffer.getLengthInBits() > totalDataCount * 8) throw new Error('Code length overflow');
        if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) buffer.put(0, 4);
        while (buffer.getLengthInBits() % 8 != 0) buffer.putBit(false);
        while (true) {
          if (buffer.getLengthInBits() >= totalDataCount * 8) break;
          buffer.put(PAD0, 8);
          if (buffer.getLengthInBits() >= totalDataCount * 8) break;
          buffer.put(PAD1, 8);
        }
        return createBytes(buffer, rsBlocks);
      };

      var createBytes = function (buffer, rsBlocks) {
        var offset = 0, maxDcCount = 0, maxEcCount = 0;
        var dcdata = new Array(rsBlocks.length), ecdata = new Array(rsBlocks.length);
        for (var r = 0; r < rsBlocks.length; r++) {
          var dcCount = rsBlocks[r].dataCount, ecCount = rsBlocks[r].totalCount - dcCount;
          maxDcCount = Math.max(maxDcCount, dcCount);
          maxEcCount = Math.max(maxEcCount, ecCount);
          dcdata[r] = new Array(dcCount);
          for (var i = 0; i < dcdata[r].length; i++) dcdata[r][i] = 0xff & buffer.getBuffer()[i + offset];
          offset += dcCount;
          var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
          var rawPoly = QRPolynomial(dcdata[r], rsPoly.getLength() - 1);
          var modPoly = rawPoly.mod(rsPoly);
          ecdata[r] = new Array(rsPoly.getLength() - 1);
          for (var i = 0; i < ecdata[r].length; i++) {
            var modIndex = i + modPoly.getLength() - ecdata[r].length;
            ecdata[r][i] = (modIndex >= 0) ? modPoly.get(modIndex) : 0;
          }
        }
        var totalCodeCount = 0;
        for (var i = 0; i < rsBlocks.length; i++) totalCodeCount += rsBlocks[i].totalCount;
        var data = new Array(totalCodeCount), index = 0;
        for (var i = 0; i < maxDcCount; i++) {
          for (var r = 0; r < rsBlocks.length; r++) {
            if (i < dcdata[r].length) data[index++] = dcdata[r][i];
          }
        }
        for (var i = 0; i < maxEcCount; i++) {
          for (var r = 0; r < rsBlocks.length; r++) {
            if (i < ecdata[r].length) data[index++] = ecdata[r][i];
          }
        }
        return data;
      };

      _this.addData = function (data) { _dataList.push(QR8bitByte(data)); _dataCache = null; };
      _this.isDark = function (row, col) {
        if (row < 0 || _moduleCount <= row || col < 0 || _moduleCount <= col) throw new Error(row + ',' + col);
        return _modules[row][col];
      };
      _this.getModuleCount = function () { return _moduleCount; };
      _this.make = function () {
        var bestMask = 0, minLostPoint = 0;
        for (var i = 0; i < 8; i++) {
          makeImpl(true, i);
          var lostPoint = QRUtil.getLostPoint(_this);
          if (i == 0 || minLostPoint > lostPoint) { minLostPoint = lostPoint; bestMask = i; }
        }
        makeImpl(false, bestMask);
      };
      return _this;
    }

    var QRErrorCorrectionLevel = { L: 1, M: 0, Q: 3, H: 2 };
    var QRMaskPattern = { PATTERN000: 0, PATTERN001: 1, PATTERN010: 2, PATTERN011: 3, PATTERN100: 4, PATTERN101: 5, PATTERN110: 6, PATTERN111: 7 };

    var QRUtil = {
      PATTERN_POSITION_TABLE: [
        [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
        [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50], [6, 30, 54],
        [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70]
      ],
      G15: (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0),
      G18: (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0),
      G15_MASK: (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1),
      getBCHTypeInfo: function (data) {
        var d = data << 10;
        while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15) >= 0) {
          d ^= (QRUtil.G15 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15)));
        }
        return ((data << 10) | d) ^ QRUtil.G15_MASK;
      },
      getBCHTypeNumber: function (data) {
        var d = data << 12;
        while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18) >= 0) {
          d ^= (QRUtil.G18 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18)));
        }
        return (data << 12) | d;
      },
      getBCHDigit: function (data) {
        var digit = 0;
        while (data != 0) { digit++; data >>>= 1; }
        return digit;
      },
      getPatternPosition: function (typeNumber) { return QRUtil.PATTERN_POSITION_TABLE[typeNumber - 1]; },
      getMaskFunction: function (maskPattern) {
        switch (maskPattern) {
          case QRMaskPattern.PATTERN000: return function (i, j) { return (i + j) % 2 == 0; };
          case QRMaskPattern.PATTERN001: return function (i, j) { return i % 2 == 0; };
          case QRMaskPattern.PATTERN010: return function (i, j) { return j % 3 == 0; };
          case QRMaskPattern.PATTERN011: return function (i, j) { return (i + j) % 3 == 0; };
          case QRMaskPattern.PATTERN100: return function (i, j) { return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 == 0; };
          case QRMaskPattern.PATTERN101: return function (i, j) { return (i * j) % 2 + (i * j) % 3 == 0; };
          case QRMaskPattern.PATTERN110: return function (i, j) { return ((i * j) % 2 + (i * j) % 3) % 2 == 0; };
          case QRMaskPattern.PATTERN111: return function (i, j) { return ((i * j) % 3 + (i + j) % 2) % 2 == 0; };
          default: throw new Error('bad maskPattern:' + maskPattern);
        }
      },
      getErrorCorrectPolynomial: function (errorCorrectLength) {
        var a = QRPolynomial([1], 0);
        for (var i = 0; i < errorCorrectLength; i++) a = a.multiply(QRPolynomial([1, QRMath.gexp(i)], 0));
        return a;
      },
      getLengthInBits: function (mode, type) {
        if (1 <= type && type < 10) {
          switch (mode) {
            case 1: return 10;
            case 2: return 9;
            case 4: return 8;
            case 8: return 8;
            default: throw new Error('mode:' + mode);
          }
        } else if (type < 27) {
          switch (mode) {
            case 1: return 12;
            case 2: return 11;
            case 4: return 16;
            case 8: return 10;
            default: throw new Error('mode:' + mode);
          }
        }
        return 14;
      },
      getLostPoint: function (qr) {
        var moduleCount = qr.getModuleCount();
        var lostPoint = 0;
        for (var row = 0; row < moduleCount; row++) {
          for (var col = 0; col < moduleCount; col++) {
            var sameCount = 0, dark = qr.isDark(row, col);
            for (var r = -1; r <= 1; r++) {
              if (row + r < 0 || moduleCount <= row + r) continue;
              for (var c = -1; c <= 1; c++) {
                if (col + c < 0 || moduleCount <= col + c || (r == 0 && c == 0)) continue;
                if (dark == qr.isDark(row + r, col + c)) sameCount++;
              }
            }
            if (sameCount > 5) lostPoint += (3 + sameCount - 5);
          }
        }
        return lostPoint;
      }
    };

    var QRMath = {
      glog: function (n) { if (n < 1) throw new Error('glog(' + n + ')'); return QRMath.LOG_TABLE[n]; },
      gexp: function (n) {
        while (n < 0) n += 255;
        while (n >= 256) n -= 255;
        return QRMath.EXP_TABLE[n];
      },
      EXP_TABLE: new Array(256),
      LOG_TABLE: new Array(256)
    };
    for (var i = 0; i < 8; i++) QRMath.EXP_TABLE[i] = 1 << i;
    for (var i = 8; i < 256; i++) QRMath.EXP_TABLE[i] = QRMath.EXP_TABLE[i - 4] ^ QRMath.EXP_TABLE[i - 5] ^ QRMath.EXP_TABLE[i - 6] ^ QRMath.EXP_TABLE[i - 8];
    for (var i = 0; i < 255; i++) QRMath.LOG_TABLE[QRMath.EXP_TABLE[i]] = i;

    function QRPolynomial(num, shift) {
      if (num.length == undefined) throw new Error(num.length + '/' + shift);
      var offset = 0;
      while (offset < num.length && num[offset] == 0) offset++;
      var _num = new Array(num.length - offset + shift);
      for (var i = 0; i < num.length - offset; i++) _num[i] = num[i + offset];
      for (var i = 0; i < shift; i++) _num[num.length - offset + i] = 0;

      var _this = {};
      _this.get = function (index) { return _num[index]; };
      _this.getLength = function () { return _num.length; };
      _this.multiply = function (e) {
        var item = new Array(_this.getLength() + e.getLength() - 1);
        for (var i = 0; i < _this.getLength(); i++) {
          for (var j = 0; j < e.getLength(); j++) {
            item[i + j] ^= QRMath.gexp(QRMath.glog(_this.get(i)) + QRMath.glog(e.get(j)));
          }
        }
        return QRPolynomial(item, 0);
      };
      _this.mod = function (e) {
        if (_this.getLength() - e.getLength() < 0) return _this;
        var ratio = QRMath.glog(_this.get(0)) - QRMath.glog(e.get(0));
        var item = new Array(_this.getLength());
        for (var i = 0; i < _this.getLength(); i++) item[i] = _this.get(i);
        for (var i = 0; i < e.getLength(); i++) item[i] ^= QRMath.gexp(QRMath.glog(e.get(i)) + ratio);
        return QRPolynomial(item, 0).mod(e);
      };
      return _this;
    }

    function QRRSBlock(totalCount, dataCount) {
      var _this = {};
      _this.totalCount = totalCount;
      _this.dataCount = dataCount;
      return _this;
    }
    QRRSBlock.RS_BLOCK_TABLE = [
      [1, 26, 19], [1, 26, 16], [1, 26, 13], [1, 26, 9],
      [1, 44, 34], [1, 44, 28], [1, 44, 22], [1, 44, 16],
      [1, 70, 55], [1, 70, 44], [2, 35, 17], [2, 35, 13],
      [1, 100, 80], [2, 50, 32], [2, 50, 24], [4, 25, 9],
      [1, 134, 108], [2, 67, 43], [2, 33, 15, 2, 34, 16], [2, 33, 11, 2, 34, 12],
      [2, 86, 68], [4, 43, 27], [4, 43, 19], [4, 43, 15],
      [2, 98, 78], [4, 49, 31], [2, 32, 14, 4, 33, 15], [4, 39, 13, 1, 40, 14],
      [2, 121, 97], [2, 60, 38, 2, 61, 39], [4, 40, 18, 2, 41, 19], [4, 40, 14, 2, 41, 15],
      [2, 146, 116], [3, 58, 36, 2, 59, 37], [4, 36, 16, 4, 37, 17], [4, 36, 12, 4, 37, 13],
      [2, 86, 68, 2, 87, 69], [4, 69, 43, 1, 70, 44], [6, 43, 19, 2, 44, 20], [6, 43, 15, 2, 44, 16]
    ];
    QRRSBlock.getRSBlocks = function (typeNumber, errorCorrectionLevel) {
      var rsBlock = QRRSBlock.getRsBlockTable(typeNumber, errorCorrectionLevel);
      if (rsBlock == undefined) throw new Error('bad rs block @ typeNumber:' + typeNumber);
      var length = rsBlock.length / 3, list = [];
      for (var i = 0; i < length; i++) {
        var count = rsBlock[i * 3 + 0], totalCount = rsBlock[i * 3 + 1], dataCount = rsBlock[i * 3 + 2];
        for (var j = 0; j < count; j++) list.push(QRRSBlock(totalCount, dataCount));
      }
      return list;
    };
    QRRSBlock.getRsBlockTable = function (typeNumber, errorCorrectionLevel) {
      switch (errorCorrectionLevel) {
        case QRErrorCorrectionLevel.L: return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
        case QRErrorCorrectionLevel.M: return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
        case QRErrorCorrectionLevel.Q: return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
        case QRErrorCorrectionLevel.H: return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
        default: return undefined;
      }
    };

    function QRBitBuffer() {
      var _buffer = [], _length = 0, _this = {};
      _this.getBuffer = function () { return _buffer; };
      _this.getLengthInBits = function () { return _length; };
      _this.put = function (num, length) {
        for (var i = 0; i < length; i++) _this.putBit(((num >>> (length - i - 1)) & 1) == 1);
      };
      _this.putBit = function (bit) {
        var bufIndex = Math.floor(_length / 8);
        if (_buffer.length <= bufIndex) _buffer.push(0);
        if (bit) _buffer[bufIndex] |= (0x80 >>> (_length % 8));
        _length++;
      };
      return _this;
    }

    function QR8bitByte(data) {
      var _data = data, _this = {};
      _this.getMode = function () { return 4; };
      _this.getLength = function () { return encodeURI(_data).replace(/%[0-9a-fA-F]{2}/g, 'a').length; };
      _this.write = function (buffer) {
        for (var i = 0; i < _data.length; i++) {
          var c = _data.charCodeAt(i);
          if (c < 128) buffer.put(c, 8);
          else {
            var encoded = encodeURI(_data.charAt(i));
            var parts = encoded.split('%');
            for (var p = 1; p < parts.length; p++) buffer.put(parseInt(parts[p], 16), 8);
          }
        }
      };
      return _this;
    }

    return {
      generateSvg: function (text, size, fill) {
        size = size || 210;
        fill = fill || '#0f172a';
        var type = 4;
        if (text.length > 80) type = 6;
        if (text.length > 130) type = 8;
        if (text.length > 180) type = 10;
        var qr = qrcode(type, 'M');
        qr.addData(text);
        qr.make();
        var count = qr.getModuleCount();
        var margin = 2;
        var total = count + margin * 2;
        var modSize = size / total;
        var path = '';
        for (var r = 0; r < count; r++) {
          for (var c = 0; c < count; c++) {
            if (qr.isDark(r, c)) {
              var x = ((c + margin) * modSize).toFixed(2);
              var y = ((r + margin) * modSize).toFixed(2);
              var s = (modSize + 0.05).toFixed(2);
              path += 'M' + x + ',' + y + 'h' + s + 'v' + s + 'h-' + s + 'z ';
            }
          }
        }
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '" shape-rendering="crispEdges">' +
               '<rect width="100%" height="100%" fill="#ffffff" rx="10" />' +
               '<path d="' + path + '" fill="' + fill + '" />' +
               '</svg>';
      }
    };
  })();

  // ── 2. Helper: HTML Sanitization & URL Scheme Whitelist ─────────────────────
  function escapeHtml(val) {
    if (val === null || val === undefined) return '';
    return String(val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function sanitizeIntentUrl(url) {
    if (!url || typeof url !== 'string') return '#';
    var trimmed = url.trim();
    if (/^(upi|tez|phonepe|paytmmp|bhim|cred):\/\/pay\?/i.test(trimmed)) {
      return trimmed.replace(/[<>"']/g, '');
    }
    return '#';
  }

  // ── 3. Script Tag Configuration Reader & Cross-Origin Auto-Detection ───────
  function getScriptConfig() {
    var script = document.currentScript ||
      document.querySelector('script[src*="craftlanee-pay.js"], script[src*="youpi.js"], script[data-craftlanee-key], script[data-youpi-key], script[data-gateway-url]');

    var serverUrl = window.location.origin;
    if (script) {
      var src = script.getAttribute('src') || '';
      var explicitUrl = script.getAttribute('data-gateway-url') || script.getAttribute('data-server-url');
      if (explicitUrl) {
        serverUrl = explicitUrl;
      } else if (src && src.startsWith('http')) {
        try {
          serverUrl = new URL(src).origin;
        } catch (e) {}
      }
    }
    serverUrl = (serverUrl || '').replace(/\/+$/, '');

    return {
      serverUrl: serverUrl,
      publicKey: script ? (script.getAttribute('data-craftlanee-key') || script.getAttribute('data-youpi-key') || '') : '',
      merchantName: script ? (script.getAttribute('data-merchant-name') || 'CraftLanee Store') : 'CraftLanee Store',
      currency: script ? (script.getAttribute('data-currency') || 'INR') : 'INR'
    };
  }

  var scriptConfig = getScriptConfig();

  // ── 4. DOM Event Dispatcher ────────────────────────────────────────────────
  function emitPaymentEvent(name, detail) {
    window.dispatchEvent(new CustomEvent('craftlanee:payment:' + name, { detail: detail, bubbles: true }));
    window.dispatchEvent(new CustomEvent('youpi:payment:' + name, { detail: detail, bubbles: true }));
    window.dispatchEvent(new CustomEvent('craftlanee:payment:result', { detail: detail, bubbles: true }));
    window.dispatchEvent(new CustomEvent('youpi:payment:result', { detail: detail, bubbles: true }));
  }

  // ── 5. Checkout Modal Controller ───────────────────────────────────────────
  class YoupiCheckoutModal {
    constructor(options = {}) {
      var resolvedUrl = (options.gatewayUrl || options.serverUrl || scriptConfig.serverUrl || window.location.origin).replace(/\/+$/, '');
      this.options = Object.assign({
        order_id: '',
        amount: 1,
        currency: 'INR',
        name: scriptConfig.merchantName || 'Merchant Store',
        description: 'UPI Payment',
        customer: {},
        metadata: {},
        serverUrl: resolvedUrl,
        sandbox: false,
        handler: null,
        onSuccess: null,
        onFailed: null,
        onClose: null
      }, options);
      this.options.serverUrl = resolvedUrl;

      this.order = null;
      this.customization = null;
      this.modules = {};
      this.modalEl = null;
      this.timerInterval = null;
      this.pollInterval = null;
      this.sseSource = null;
      this.escapeHandler = null;
      this.remainingSeconds = 300;
      this.isClosed = false;
    }

    async open() {
      try {
        await this.createSession();
        this.render();
        this.startWatchers();
        emitPaymentEvent('opened', { order_id: this.order.order_id, amount: this.order.amount_locked });
      } catch (err) {
        alert('Payment initialization failed: ' + err.message);
        if (typeof this.options.onFailed === 'function') {
          this.options.onFailed({ error: err.message });
        }
      }
    }

    async createSession() {
      var url = this.options.serverUrl + '/api/v1/orders';
      var res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: this.options.amount,
          order_id: this.options.order_id || ('cl_ord_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
          currency: this.options.currency || 'INR',
          customer: this.options.customer,
          metadata: this.options.metadata,
          sandbox: this.options.sandbox
        })
      });

      var data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to start payment session');
      }

      this.order = data.order;
      this.customization = data.customization || {
        display_title: 'CraftLanee Secure Checkout',
        subtitle: 'Instant 0% Fee UPI Payment',
        primary_color: '#10b981',
        bg_color: '#141414',
        border_radius: '16px',
        font_family: 'sans-serif',
        show_qr: true,
        show_intent_buttons: true,
        show_timer: true,
        show_order_badge: true,
        timer_seconds: 300,
        trust_badge: '🔒 256-bit Encrypted · Direct Bank Settlement'
      };
      this.modules = data.modules || {
        upi_intent: true,
        manual_utr: true,
        bank_scraper: true,
        android_observer: true,
        sandbox_simulator: true
      };
      this.remainingSeconds = parseInt(this.customization.timer_seconds || '300', 10);
    }

    render() {
      var c = this.customization;
      var m = this.modules;
      var o = this.order;

      var overlay = document.createElement('div');
      overlay.id = 'craftlanee-pay-modal';
      overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(10, 10, 10, 0.85); backdrop-filter: blur(8px);
        display: flex; align-items: center; justify-content: center;
        z-index: 999999; font-family: ${c.font_family === 'mono' ? 'ui-monospace, monospace' : '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'};
        color: #ffffff; padding: 16px; box-sizing: border-box;
      `;

      var qrSvg = c.show_qr !== false ? qrcodeLib.generateSvg(o.upi_uri, 210, '#0f172a') : '';
      var isPaiseLocked = Math.abs(o.amount_locked - o.amount_requested) > 0.001;

      // Mobile Intent Deep Links (Module 1)
      var callbackUrl = encodeURIComponent(`${this.options.serverUrl}/api/v1/intent/callback?order_id=${encodeURIComponent(o.order_id)}`);
      var intentUri = `${o.upi_uri}&url=${callbackUrl}`;
      var baseParams = intentUri.replace(/^upi:\/\/pay\?/, '');

      var gpayUrl = sanitizeIntentUrl('tez://upi/pay?' + baseParams);
      var phonepeUrl = sanitizeIntentUrl('phonepe://pay?' + baseParams);
      var paytmUrl = sanitizeIntentUrl('paytmmp://pay?' + baseParams);
      var genericUpiUrl = sanitizeIntentUrl('upi://pay?' + baseParams);

      var intentButtonsHtml = '';
      if (m.upi_intent !== false && c.show_intent_buttons !== false) {
        intentButtonsHtml = `
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 16px;">
            <a href="${gpayUrl}" style="text-decoration: none; background: #222225; border: 1px solid #333338; border-radius: 8px; padding: 8px 4px; display: flex; flex-direction: column; align-items: center; gap: 4px; color: #ffffff;">
              <span style="font-size: 16px;">📱</span>
              <span style="font-size: 10px; font-weight: 600; color: #a1a1aa;">GPay</span>
            </a>
            <a href="${phonepeUrl}" style="text-decoration: none; background: #222225; border: 1px solid #333338; border-radius: 8px; padding: 8px 4px; display: flex; flex-direction: column; align-items: center; gap: 4px; color: #ffffff;">
              <span style="font-size: 16px;">🟣</span>
              <span style="font-size: 10px; font-weight: 600; color: #a1a1aa;">PhonePe</span>
            </a>
            <a href="${paytmUrl}" style="text-decoration: none; background: #222225; border: 1px solid #333338; border-radius: 8px; padding: 8px 4px; display: flex; flex-direction: column; align-items: center; gap: 4px; color: #ffffff;">
              <span style="font-size: 16px;">🔵</span>
              <span style="font-size: 10px; font-weight: 600; color: #a1a1aa;">Paytm</span>
            </a>
            <a href="${genericUpiUrl}" style="text-decoration: none; background: #222225; border: 1px solid #333338; border-radius: 8px; padding: 8px 4px; display: flex; flex-direction: column; align-items: center; gap: 4px; color: #ffffff;">
              <span style="font-size: 16px;">💳</span>
              <span style="font-size: 10px; font-weight: 600; color: #a1a1aa;">BHIM / UPI</span>
            </a>
          </div>
        `;
      }

      // Manual UTR / "I Have Paid" drawer (Module 3)
      var manualUtrHtml = '';
      if (m.manual_utr !== false) {
        manualUtrHtml = `
          <div style="border-top: 1px solid #27272a; padding-top: 12px; text-align: left;">
            <button id="cl-toggle-utr" style="background: transparent; border: none; color: ${escapeHtml(c.primary_color || '#38bdf8')}; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 4px 0; font-weight: 600;">
              <span>💬 I Have Paid (Enter 12-Digit UTR)</span>
              <span id="cl-utr-arrow">▼</span>
            </button>
            <div id="cl-utr-drawer" style="display: none; margin-top: 10px;">
              <div style="display: flex; gap: 8px;">
                <input id="cl-utr-input" type="text" maxlength="12" placeholder="Enter 12-digit UPI UTR" style="flex: 1; background: #09090b; border: 1px solid #3f3f46; color: #ffffff; padding: 8px 12px; border-radius: 6px; font-size: 13px; font-family: monospace; outline: none;" />
                <button id="cl-submit-utr-btn" style="background: ${escapeHtml(c.primary_color || '#0284c7')}; border: none; color: #ffffff; padding: 8px 14px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;">Verify</button>
              </div>
              <div id="cl-utr-feedback" style="font-size: 11px; margin-top: 6px; display: none;"></div>
            </div>
          </div>
        `;
      }

      // Sandbox button (Module 5)
      var sandboxHtml = '';
      if (m.sandbox_simulator !== false || this.options.sandbox) {
        sandboxHtml = `
          <div style="margin-top: 12px; border-top: 1px dashed #3f3f46; padding-top: 12px;">
            <button id="cl-sandbox-btn" style="width: 100%; background: #27272a; border: 1px solid #52525b; color: #fbbf24; font-size: 12px; font-weight: 600; padding: 7px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;">
              <span>⚡ Dev Sandbox: Simulate Instant Bank Credit</span>
            </button>
          </div>
        `;
      }

      overlay.innerHTML = `
        <div id="cl-modal-card" style="background: ${escapeHtml(c.bg_color || '#141414')}; border: 1px solid #27272a; border-radius: ${escapeHtml(c.border_radius || '16px')}; width: 100%; max-width: 430px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.8); overflow: hidden; animation: clModalPop 0.22s ease-out;">
          <!-- Header -->
          <div style="padding: 16px 20px; border-bottom: 1px solid #27272a; display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.02);">
            <div style="display: flex; align-items: center; gap: 10px;">
              ${c.logo_url ? `<img src="${escapeHtml(c.logo_url)}" style="width: 30px; height: 30px; border-radius: 6px; object-fit: contain;" />` : `
                <div style="width: 30px; height: 30px; background: ${escapeHtml(c.primary_color || '#10b981')}; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 15px; color:#000000;">⚡</div>
              `}
              <div>
                <div style="font-weight: 700; font-size: 14px; letter-spacing: 0.2px;">${escapeHtml(c.display_title || 'CraftLanee Pay')}</div>
                <div style="font-size: 11px; color: #a1a1aa;">${escapeHtml(c.subtitle || this.options.name || 'Instant UPI Checkout')}</div>
              </div>
            </div>
            <button id="cl-close-btn" style="background: transparent; border: none; color: #a1a1aa; font-size: 18px; cursor: pointer; padding: 4px 6px; line-height: 1;">✕</button>
          </div>

          <!-- Body -->
          <div style="padding: 20px; text-align: center;">
            <div style="font-size: 12px; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 600;">Amount to Pay</div>
            <div style="font-size: 36px; font-weight: 800; color: #ffffff; margin: 4px 0 6px; letter-spacing: -0.5px;">
              ₹${Number(o.amount_locked).toFixed(2)}
            </div>

            ${isPaiseLocked ? `
              <div style="display: inline-block; background: rgba(16, 185, 129, 0.15); border: 1px solid ${escapeHtml(c.primary_color || '#10b981')}; color: #34d399; font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 20px; margin-bottom: 14px;">
                ⚡ Pay exact paise (₹${Number(o.amount_locked).toFixed(2)}) for instant settlement
              </div>
            ` : '<div style="margin-bottom: 10px;"></div>'}

            <!-- QR Code -->
            ${c.show_qr !== false ? `
              <div style="background: #ffffff; padding: 12px; border-radius: 12px; display: inline-block; margin-bottom: 14px; box-shadow: 0 4px 20px rgba(0,0,0,0.4);">
                <div id="cl-qr-container">${qrSvg}</div>
              </div>
            ` : ''}

            <!-- VPA Bar -->
            <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 16px;">
              <span style="font-size: 12px; color: #d4d4d8; font-family: monospace; background: #222225; padding: 5px 10px; border-radius: 6px; border: 1px solid #333338;">${escapeHtml(o.vpa_assigned)}</span>
              <button id="cl-copy-vpa" style="background: #222225; border: 1px solid #333338; color: #e4e4e7; font-size: 11px; padding: 5px 9px; border-radius: 6px; cursor: pointer;">Copy</button>
            </div>

            <!-- Intent buttons (Module 1) -->
            ${intentButtonsHtml}

            <!-- Status Indicator & Timer -->
            <div style="background: #1c1c1f; border: 1px solid #27272a; border-radius: 8px; padding: 10px 14px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span id="cl-status-dot" style="width: 8px; height: 8px; border-radius: 50%; background: ${escapeHtml(c.primary_color || '#10b981')}; display: inline-block; box-shadow: 0 0 10px ${escapeHtml(c.primary_color || '#10b981')};"></span>
                <span id="cl-status-text" style="font-size: 12px; font-weight: 500; color: #e4e4e7;">Waiting for UPI transfer...</span>
              </div>
              ${c.show_timer !== false ? `
                <div id="cl-timer" style="font-size: 12px; font-family: monospace; color: #a1a1aa; font-weight: 600;">05:00</div>
              ` : ''}
            </div>

            <!-- Manual UTR (Module 3) -->
            ${manualUtrHtml}

            <!-- Sandbox simulator (Module 5) -->
            ${sandboxHtml}
          </div>

          <!-- Footer Trust Badge -->
          <div style="padding: 10px 20px; background: rgba(0,0,0,0.3); border-top: 1px solid #27272a; font-size: 11px; color: #71717a; display: flex; align-items: center; justify-content: space-between;">
            ${c.show_order_badge !== false ? `<span>Ref: <span style="font-family: monospace;">${escapeHtml(o.order_id)}</span></span>` : '<span></span>'}
            <span>${escapeHtml(c.trust_badge || '🔒 Secured by CraftLanee Pay')}</span>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);
      this.modalEl = overlay;

      // Backdrop click to close
      overlay.onclick = (e) => {
        if (e.target === overlay) this.close();
      };

      // Escape key to close
      this.escapeHandler = (e) => {
        if (e.key === 'Escape' || e.keyCode === 27) {
          this.close();
        }
      };
      document.addEventListener('keydown', this.escapeHandler);

      // Event Bindings
      document.getElementById('cl-close-btn').onclick = () => this.close();
      document.getElementById('cl-copy-vpa').onclick = () => {
        navigator.clipboard.writeText(this.order.vpa_assigned);
        var btn = document.getElementById('cl-copy-vpa');
        btn.textContent = 'Copied!';
        setTimeout(() => { if (btn) btn.textContent = 'Copy'; }, 2000);
      };

      // Module 3 Drawer
      var toggleBtn = document.getElementById('cl-toggle-utr');
      if (toggleBtn) {
        var drawer = document.getElementById('cl-utr-drawer');
        var arrow = document.getElementById('cl-utr-arrow');
        toggleBtn.onclick = () => {
          var isOpen = drawer.style.display === 'block';
          drawer.style.display = isOpen ? 'none' : 'block';
          arrow.textContent = isOpen ? '▼' : '▲';
        };
        document.getElementById('cl-submit-utr-btn').onclick = () => this.submitUtr();
      }

      // Module 5 Sandbox
      var sandboxBtn = document.getElementById('cl-sandbox-btn');
      if (sandboxBtn) {
        sandboxBtn.onclick = () => this.simulateSandbox();
      }
    }

    startWatchers() {
      // 1. Timer
      if (this.customization.show_timer !== false) {
        this.timerInterval = setInterval(() => {
          if (this.isClosed) return;
          this.remainingSeconds--;
          if (this.remainingSeconds <= 0) {
            clearInterval(this.timerInterval);
            this.handleExpired();
            return;
          }
          var mins = Math.floor(this.remainingSeconds / 60);
          var secs = this.remainingSeconds % 60;
          var el = document.getElementById('cl-timer');
          if (el) el.textContent = `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
        }, 1000);
      }

      // 2. SSE Watcher
      try {
        var streamUrl = this.options.serverUrl + '/api/v1/orders/' + encodeURIComponent(this.order.order_id) + '/stream';
        this.sseSource = new EventSource(streamUrl);
        this.sseSource.onmessage = (e) => {
          if (this.isClosed) return;
          try {
            var data = JSON.parse(e.data);
            if (data.status === 'SUCCESS') {
              this.handleSuccess(data);
            } else if (data.status === 'UTR_SUBMITTED') {
              this.handleUtrSubmitted(data);
            } else if (data.status === 'EXPIRED') {
              this.handleExpired();
            }
          } catch (err) {}
        };
      } catch (err) {}

      // 3. Fallback Poll
      this.pollInterval = setInterval(async () => {
        if (this.isClosed) return;
        try {
          var res = await fetch(this.options.serverUrl + '/api/v1/orders/' + encodeURIComponent(this.order.order_id));
          var data = await res.json();
          if (data && data.order && !this.isClosed) {
            if (data.order.status === 'SUCCESS') {
              this.handleSuccess(data.order);
            } else if (data.order.status === 'UTR_SUBMITTED') {
              this.handleUtrSubmitted(data.order);
            } else if (data.order.status === 'EXPIRED') {
              this.handleExpired();
            }
          }
        } catch (err) {}
      }, 3000);
    }

    async submitUtr() {
      var input = document.getElementById('cl-utr-input');
      var feedback = document.getElementById('cl-utr-feedback');
      var utr = (input.value || '').trim();

      if (!/^\d{12}$/.test(utr)) {
        feedback.style.display = 'block';
        feedback.style.color = '#ef4444';
        feedback.textContent = 'Please enter a valid 12-digit numeric UPI UTR';
        return;
      }

      feedback.style.display = 'block';
      feedback.style.color = '#a1a1aa';
      feedback.textContent = 'Syncing bank statement & ledger...';

      try {
        var res = await fetch(this.options.serverUrl + '/api/v1/verify/manual', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_id: this.order.order_id, utr: utr })
        });
        var data = await res.json();

        if (data.success) {
          emitPaymentEvent('utr_submitted', { order_id: this.order.order_id, utr: utr, status: data.status });
          if (data.status === 'SUCCESS') {
            this.handleSuccess(data);
          } else {
            feedback.style.color = '#f59e0b';
            feedback.textContent = data.message || 'Confirming with bank ledger...';
            var statusText = document.getElementById('cl-status-text');
            if (statusText) statusText.textContent = 'Awaiting bank confirmation...';
          }
        } else {
          feedback.style.color = '#ef4444';
          feedback.textContent = data.error || 'Verification failed';
        }
      } catch (err) {
        feedback.style.color = '#ef4444';
        feedback.textContent = 'Connection error: ' + err.message;
      }
    }

    async simulateSandbox() {
      var statusText = document.getElementById('cl-status-text');
      if (statusText) statusText.textContent = 'Simulating instant bank settlement...';

      try {
        var res = await fetch(this.options.serverUrl + '/api/v1/sandbox/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_id: this.order.order_id })
        });
        var data = await res.json();
        if (data.success) {
          this.handleSuccess(data.order || data);
        } else {
          alert('Sandbox simulation rejected: ' + data.error);
        }
      } catch (err) {
        alert('Sandbox simulation error: ' + err.message);
      }
    }

    handleUtrSubmitted(data) {
      var statusText = document.getElementById('cl-status-text');
      var statusDot = document.getElementById('cl-status-dot');
      if (statusText) statusText.textContent = 'UTR submitted. Confirming with bank ledger...';
      if (statusDot) {
        statusDot.style.background = '#f59e0b';
        statusDot.style.boxShadow = '0 0 10px #f59e0b';
      }
    }

    handleSuccess(result) {
      this.cleanup();
      var statusText = document.getElementById('cl-status-text');
      var statusDot = document.getElementById('cl-status-dot');
      if (statusText) statusText.textContent = 'Payment Confirmed! 🎉';
      if (statusDot) {
        statusDot.style.background = '#10b981';
        statusDot.style.boxShadow = '0 0 12px #10b981';
      }

      var detail = {
        order_id: this.order.order_id,
        amount: this.order.amount_requested,
        amount_locked: this.order.amount_locked,
        utr: result.utr || this.order.utr || '',
        status: 'SUCCESS',
        verification_method: result.verification_method || 'SETTLED'
      };

      emitPaymentEvent('success', detail);

      if (typeof this.options.handler === 'function') this.options.handler(detail);
      if (typeof this.options.onSuccess === 'function') this.options.onSuccess(detail);

      setTimeout(() => { this.close(); }, 1800);
    }

    handleExpired() {
      this.cleanup();
      var statusText = document.getElementById('cl-status-text');
      var statusDot = document.getElementById('cl-status-dot');
      if (statusText) statusText.textContent = 'Session Expired';
      if (statusDot) {
        statusDot.style.background = '#ef4444';
        statusDot.style.boxShadow = '0 0 10px #ef4444';
      }
      emitPaymentEvent('expired', { order_id: this.order.order_id });
      if (typeof this.options.onFailed === 'function') {
        this.options.onFailed({ order_id: this.order.order_id, reason: 'EXPIRED' });
      }
    }

    cleanup() {
      this.isClosed = true;
      if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; }
      if (this.pollInterval) { clearInterval(this.pollInterval); this.pollInterval = null; }
      if (this.sseSource) { this.sseSource.close(); this.sseSource = null; }
      if (this.escapeHandler) {
        document.removeEventListener('keydown', this.escapeHandler);
        this.escapeHandler = null;
      }
    }

    close() {
      this.cleanup();
      if (this.modalEl && this.modalEl.parentNode) {
        this.modalEl.parentNode.removeChild(this.modalEl);
        this.modalEl = null;
      }
      emitPaymentEvent('closed', { order_id: this.order?.order_id });
      if (typeof this.options.onClose === 'function') this.options.onClose();
    }
  }

  // ── 6. Universal API Surface ───────────────────────────────────────────────
  var Youpi = {
    pay: function (options) {
      var modal = new YoupiCheckoutModal(options);
      modal.open();
      return modal;
    },
    open: function (options) {
      return Youpi.pay(options);
    },
    version: '2.5.0-production'
  };

  window.Youpi = Youpi;
  window.YoupiCheckout = Youpi;
  window.CraftLaneePay = Youpi;

  // ── 7. Declarative HTML Button Listener ────────────────────────────────────
  function initDeclarativeButtons() {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-craftlanee-pay], [data-youpi-pay]');
      if (!btn) return;
      e.preventDefault();

      var amount = parseFloat(btn.getAttribute('data-amount') || '1');
      var orderId = btn.getAttribute('data-order-id') || ('ord_' + Date.now().toString(36));
      var name = btn.getAttribute('data-name') || scriptConfig.merchantName;
      var sandbox = btn.getAttribute('data-sandbox') === 'true';

      Youpi.pay({
        amount: amount,
        order_id: orderId,
        name: name,
        sandbox: sandbox
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDeclarativeButtons);
  } else {
    initDeclarativeButtons();
  }

})(typeof window !== 'undefined' ? window : this);
