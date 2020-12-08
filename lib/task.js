'use strict'

const pluginOptions = require('./plugin-options')
const maybeRelease = require('./maybe-release')
const Runner = require('./runner')
const noop = function () {}

class Task extends Runner.AbstractRunner {
  constructor (name) {
    super()

    this._collectors = []
    this._processors = []
    this._publishers = []
    this._schedules = []
    this._pingablePlugins = []

    this._frozen = false
    this._pinging = false
    this._multiRunner = new Runner.MultiRunner()
    this._name = `Task(${name || 'anonymous'})`

    this._multiRunner.on('error', (err, emitter) => {
      // TODO (!): TBD how errors are best handled. Perhaps like Snap, where 10
      // consecutive errors will cause the Snap workflow to stop.
      this.emit('error', err, emitter || this._multiRunner)
    })

    this._pingIndex = 0
    this._pingCallback = null
    this._noPingTarget = fqn([this._name, 'None'])
    this._currentPingTarget = this._noPingTarget
    this._pingNext = this._pingNext.bind(this)
  }

  collect (pluginFn, options) {
    return this._takePlugins('collect', pluginFn, options, (collector) => {
      this._collectors.push(collector)
    })
  }

  process (pluginFn, options) {
    return this._takePlugins('process', pluginFn, options, (processor) => {
      this._processors.push(processor)
    })
  }

  publish (pluginFn, options) {
    return this._takePlugins('publish', pluginFn, options, (publisher) => {
      this._publishers.push(publisher)
    })
  }

  schedule (pluginFn, options) {
    return this._takePlugins('schedule', pluginFn, options, (schedule) => {
      this._schedules.push(schedule)
    })
  }

  // For generic plugins, like presets and plugins that serve multiple roles.
  use (pluginFn, options) {
    return this._takePlugins('use', pluginFn, options, noop)
  }

  unref () {
    this._multiRunner.unref()
  }

  _takePlugins (method, arg1, arg2, add) {
    if (this._frozen) {
      throw new Error(`Cannot ${method}() after task has been frozen`)
    }

    if (typeof arg1 === 'function') {
      add(this._callPlugin(arg1, arg2))
    } else if (Array.isArray(arg1)) {
      for (const el of arg1) {
        if (typeof el === 'function') {
          add(this._callPlugin(el, arg2))
        } else if (Array.isArray(el) && el.length >= 1) {
          add(this._callPlugin(el[0], Object.assign({}, el[1], arg2)))
        } else {
          throw new TypeError(`Nested plugin in ${method}([plugin, ..]) must be a function or an array in the form [plugin, options]`)
        }
      }
    } else {
      throw new TypeError(`First argument in ${method}(arg) must be a function or an array in the form [plugin, ..]`)
    }

    return this
  }

  _callPlugin (pluginFn, options) {
    return pluginFn(pluginOptions(options), this)
  }

  _start (callback) {
    this._initialize()
    this._multiRunner.start(callback)
  }

  _initialize () {
    if (this._frozen) return

    this._frozen = true
    this._initializePlugins()
    this._connectPlugins()
  }

  _initializePlugins () {
    // All plugins are pinged, except schedules, which initiate the pinging.
    const wrappedPlugins = this._collectors.map(wrapper(this._name, 'Collector'))
      .concat(this._processors.map(wrapper(this._name, 'Processor')))
      .concat(this._publishers.map(wrapper(this._name, 'Publisher')))

    // Wrap plugins to give them a consistent interface and start/stop behavior.
    const decoratedPlugins = wrappedPlugins.map(unwrap).map(Runner.decorate)
    const decoratedSchedulePlugins = this._schedules.map(Runner.decorate)

    this._pingablePlugins = wrappedPlugins.filter(wrapped => wrapped.pingable)

    // Add plugins to the MultiRunner, to be able to start/stop them as a group.
    for (const runner of decoratedPlugins) {
      this._multiRunner.addRunner(runner)
    }

    // Schedules must be the last started and first stopped. To ensure that any
    // queued up metric or other state is released, the stop order of a task is:
    //
    // 1. Schedules (may wait and do a last ping)
    // 2. Collectors (may flush queued metrics, because of the ping or the stop)
    // 3. Processors (may flush queued metrics, because of the ping or the stop)
    // 4. Publishers (may flush queued metrics, because of the ping or the stop)
    for (const runner of decoratedSchedulePlugins) {
      this._multiRunner.addRunner(runner, { stopFirst: true })
    }
  }

  _connectPlugins () {
    const publish = (metric) => {
      for (const publisher of this._publishers) {
        publisher.publish(metric)
      }

      // TODO (optim)
      maybeRelease(metric)
    }

    if (this._processors.length === 0) {
      // Connect collectors to publishers
      for (const collector of this._collectors) {
        collector.on('metric', publish)
      }
    } else {
      const firstProcessor = this._processors[0]
      const lastProcessor = this._processors[this._processors.length - 1]

      // Connect collectors to first processor
      for (const collector of this._collectors) {
        collector.on('metric', (metric) => {
          firstProcessor.process(metric)
        })
      }

      // Connect first processor to second, second to third, etc
      this._processors.reduce((prev, curr) => {
        prev.on('metric', (metric) => curr.process(metric))
        return curr
      })

      // Connect last processor to publishers
      lastProcessor.on('metric', publish)
    }
  }

  _stop (callback) {
    // Stop all plugins. Note that whatever plugin calls ping() is responsible
    // for waiting for a ping to complete before stopping itself.
    // TODO (later): disconnect plugins (remove event listeners)
    this._multiRunner.stop(callback)
  }

  ping (callback) {
    if (this._pinging) {
      throw new Error('Cannot ping() before completion of previous ping')
    }

    this._pinging = true
    this._pingIndex = 0
    this._pingCallback = callback
    this._pingNext()
  }

  // TODO (later): do reuse callbacks, but create one callback per plugin.
  _pingNext (err) {
    // TODO: should we emit an error event instead?
    // TODO: wrap error
    if (err) process.emitWarning(err)

    if (this._pinging === false) {
      process.emitWarning('Plugin called the ping callback more than once', 'TelemetryWarning')
    } else if (this._pingIndex === this._pingablePlugins.length) {
      const callback = this._pingCallback

      this._pinging = false
      this._pingCallback = null
      this._currentPingTarget = this._noPingTarget

      process.nextTick(callback)
    } else {
      const wrapped = this._pingablePlugins[this._pingIndex++]
      this._currentPingTarget = wrapped.name
      wrapped.plugin.ping(this._pingNext)
    }
  }

  // Exposed for debugging purposes
  currentPingTarget () {
    return this._currentPingTarget
  }
}

module.exports = Task

class Wrapped {
  constructor (plugin, name, pingable) {
    this.plugin = plugin
    this.name = name
    this.pingable = pingable
  }
}

function wrapper (taskName, role) {
  return function wrap (plugin, index) {
    const parts = [taskName, `${role}[${index}]`, pluginName(plugin)]
    const pingable = typeof plugin.ping === 'function'

    return new Wrapped(plugin, fqn(parts), pingable)
  }
}

function unwrap (wrapped) {
  return wrapped.plugin
}

function fqn (parts) {
  return `<${parts.join(':')}>`
}

function pluginName (plugin) {
  try {
    const proto = Object.getPrototypeOf(plugin)
    return proto ? proto.constructor.name || 'Anonymous' : 'Object'
  } catch (err) {
    process.emitWarning(err)
    return 'Indeterminate'
  }
}
