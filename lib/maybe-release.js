'use strict'

module.exports = function (metric) {
  if (typeof metric.release === 'function') {
    metric.release()
  }
}
