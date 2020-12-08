'use strict'

const EventEmitter = require('events').EventEmitter
const combine = require('combine-errors')

const status = Symbol('status')
const STATUS_STARTING = 'starting'
const STATUS_STARTED = 'started'
const STATUS_STOPPING = 'stopping'
const STATUS_STOPPED = 'stopped'

class AbstractRunner extends EventEmitter {
  constructor () {
    super()

    if (new.target === AbstractRunner) {
      throw new Error('Cannot instantiate AbstractRunner class')
    }

    this[status] = STATUS_STOPPED
    this.start = this.start.bind(this)
    this.stop = this.stop.bind(this)
  }

  get status () {
    return this[status]
  }

  start (options, callback) {
    if (typeof options === 'function') {
      callback = options
      options = null
    } else if (callback === undefined) {
      var promise = new Promise((resolve, reject) => {
        callback = function (err) {
          if (err) reject(err)
          else resolve()
        }
      })
    }

    if (options && options.grace) {
      if (this[status] === STATUS_STARTED) {
        process.nextTick(callback)
        return promise
      } else if (this[status] === STATUS_STARTING) {
        this.once('start', (err) => process.nextTick(callback, err))
        return promise
      } else if (this[status] === STATUS_STOPPING) {
        this.once('stop', () => process.nextTick(this.start, options, callback))
        return promise
      }
    }

    if (this[status] === STATUS_STARTED || this[status] === STATUS_STARTING) {
      throw new Error('Cannot start() before stop()')
    } else if (this[status] === STATUS_STOPPING) {
      throw new Error('Cannot start() before stop() has completed')
    }

    this[status] = STATUS_STARTING

    this._start((err) => {
      this[status] = err ? STATUS_STOPPED : STATUS_STARTED
      this.emit('start', err)
      callback(err)
    })

    return promise
  }

  stop (options, callback) {
    if (typeof options === 'function') {
      callback = options
      options = null
    } else if (callback === undefined) {
      var promise = new Promise((resolve, reject) => {
        callback = function (err) {
          if (err) reject(err)
          else resolve()
        }
      })
    }

    if (options && options.grace) {
      if (this[status] === STATUS_STOPPED) {
        process.nextTick(callback)
        return promise
      } else if (this[status] === STATUS_STOPPING) {
        this.once('stop', (err) => process.nextTick(callback, err))
        return promise
      } else if (this[status] === STATUS_STARTING) {
        this.once('start', () => process.nextTick(this.stop, options, callback))
        return promise
      }
    }

    if (this[status] === STATUS_STOPPED || this[status] === STATUS_STOPPING) {
      throw new Error('Cannot stop() before start()')
    } else if (this[status] === STATUS_STARTING) {
      throw new Error('Cannot stop() before start() has completed')
    }

    this[status] = STATUS_STOPPING

    this._stop((err) => {
      this[status] = STATUS_STOPPED
      this.emit('stop', err)
      callback(err)
    })

    return promise
  }

  unref () {

  }
}

class DecoratedRunner extends AbstractRunner {
  constructor (nut) {
    super()
    this._nut = nut

    // TODO (later): are all plugins event emitters?
    if (typeof nut.on === 'function') {
      nut.on('error', (err) => {
        this.emit('error', err, nut)
      })
    }
  }

  _start (callback) {
    if (typeof this._nut.start === 'function') {
      this._nut.start(callback)
    } else {
      process.nextTick(callback)
    }
  }

  _stop (callback) {
    if (typeof this._nut.stop === 'function') {
      this._nut.stop(callback)
    } else {
      process.nextTick(callback)
    }
  }

  unref () {
    if (typeof this._nut.unref === 'function') {
      this._nut.unref()
    }
  }
}

class MultiRunner extends AbstractRunner {
  constructor (runners) {
    super()

    this._startOrder = []
    this._stopOrder = []
    this._unref = false
    this._frozen = false

    // TODO (later): deprecate `runners` argument, prefer addRunner().
    if (runners != null) {
      if (!Array.isArray(runners)) {
        throw new TypeError('First argument "runners" must be an array')
      }

      runners.forEach((runner) => this.addRunner(runner))
    }
  }

  addRunner (runner, options) {
    if (this._frozen) {
      throw new Error('Cannot addRunner() after start()')
    }

    const stopFirst = options && options.stopFirst

    this._startOrder.push(runner)
    this._stopOrder[stopFirst ? 'unshift' : 'push'](runner)

    runner.on('error', (err, emitter) => {
      this.emit('error', err, emitter || runner)
    })

    if (this._unref) {
      runner.unref()
    }
  }

  _start (callback) {
    this._frozen = true

    const runners = this._startOrder
    const length = runners.length

    let pos = 0

    // Start sequentially
    const loop = (err) => {
      if (err) {
        // Stop runners that did start
        this._cancelStart(callback, [err])
      } else if (pos >= length) {
        process.nextTick(callback)
      } else {
        const runner = runners[pos++]

        runner.start(loop)
        if (this._unref) runner.unref()
      }
    }

    loop()
  }

  _cancelStart (callback, errors) {
    const runners = this._stopOrder
    const length = runners.length
    const withGrace = { grace: true }

    let pos = 0

    // Stop sequentially
    const loop = (err) => {
      if (err) errors.push(err)

      if (pos >= length) {
        process.nextTick(callback, combine(errors))
      } else {
        runners[pos++].stop(withGrace, loop)
      }
    }

    loop()
  }

  _stop (callback) {
    const runners = this._stopOrder
    const length = runners.length
    const errors = []

    let pos = 0

    // Stop sequentially
    const loop = (err) => {
      if (err) errors.push(err)

      if (pos >= length) {
        process.nextTick(callback, errors.length > 0 ? combine(errors) : null)
      } else {
        runners[pos++].stop(loop)
      }
    }

    loop()
  }

  unref () {
    this._unref = true

    for (const runner of this._startOrder) {
      runner.unref()
    }
  }
}

exports.AbstractRunner = AbstractRunner
exports.DecoratedRunner = DecoratedRunner
exports.MultiRunner = MultiRunner

exports.decorate = (...args) => new DecoratedRunner(...args)
