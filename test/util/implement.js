'use strict'

module.exports = function (Proto) {
  Proto = Proto || class Dummy {}

  return function implement (methods, order, instanceId) {
    const Test = class Test extends Proto {}

    for (const k of Object.keys(methods)) {
      Test.prototype[k] = function (...args) {
        this.calls = this.calls || {}
        this.calls[k] = this.calls[k] || []
        this.calls[k].push(args.filter(arg => typeof arg !== 'function'))

        if (order) order.push([instanceId || this, k])
        return methods[k].apply(this, args)
      }
    }

    return new Test()
  }
}
