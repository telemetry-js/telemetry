'use strict'

module.exports = function (options) {
  if (options == null) {
    return {}
  } else if (typeof options === 'object') {
    return Object.assign({}, options)
  } else {
    throw new TypeError('Unexpected type for options object')
  }
}
