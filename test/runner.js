'use strict'

const test = require('tape')
const Runner = require('../lib/runner')
const implement = require('./util/implement')(Runner.AbstractRunner)
const noop = function () {}

test('AbstractRunner start', function (t) {
  t.plan(4)

  const runner = implement({
    _start: setImmediate,
    _stop: setImmediate
  })

  try {
    runner.stop(noop)
  } catch (err) {
    t.is(err.message, 'Cannot stop() before start()')
  }

  runner.start((err) => {
    t.ifError(err, 'no error')
    t.same(runner.calls, { _start: [[]] })
  })

  try {
    runner.start(noop)
  } catch (err) {
    t.is(err.message, 'Cannot start() before stop()')
  }
})

test('AbstractRunner start with grace', function (t) {
  t.plan(4)

  const runner = implement({
    _start: setImmediate,
    _stop: setImmediate
  })

  runner.start((err) => {
    t.ifError(err, 'no error')
    t.same(runner.calls, { _start: [[]] })
  })

  runner.start({ grace: true }, (err) => {
    t.ifError(err, 'no error')
    t.same(runner.calls, { _start: [[]] }, 'started only once')
  })
})

test('AbstractRunner start and stop', function (t) {
  t.plan(5)

  const runner = implement({
    _start: setImmediate,
    _stop: setImmediate
  })

  runner.start((err) => {
    t.ifError(err, 'no error')
    t.same(runner.calls, { _start: [[]] })

    runner.stop((err) => {
      t.ifError(err, 'no error')
      t.same(runner.calls, { _start: [[]], _stop: [[]] })
    })

    try {
      runner.stop(noop)
    } catch (err) {
      t.is(err.message, 'Cannot stop() before start()')
    }
  })
})

test('AbstractRunner start and stop with grace', function (t) {
  t.plan(6)

  const runner = implement({
    _start: setImmediate,
    _stop: setImmediate
  })

  runner.start((err) => {
    t.ifError(err, 'no error')
    t.same(runner.calls, { _start: [[]] })

    runner.stop((err) => {
      t.ifError(err, 'no error')
      t.same(runner.calls, { _start: [[]], _stop: [[]] })
    })

    runner.stop({ grace: true }, (err) => {
      t.ifError(err, 'no error')
      t.same(runner.calls, { _start: [[]], _stop: [[]] }, 'only stopped once')
    })
  })
})

test('AbstractRunner stop before start has completed', function (t) {
  t.plan(2)

  const runner = implement({
    _start: setImmediate,
    _stop: setImmediate
  })

  runner.start((err) => {
    t.ifError(err, 'no error')
  })

  try {
    runner.stop(noop)
  } catch (err) {
    t.is(err.message, 'Cannot stop() before start() has completed')
  }
})

test('AbstractRunner stop before start has completed, with grace', function (t) {
  t.plan(3)

  const runner = implement({
    _start: setImmediate,
    _stop: setImmediate
  })

  runner.start((err) => {
    t.ifError(err, 'no error')
  })

  runner.stop({ grace: true }, (err) => {
    t.ifError(err, 'no error')
    t.same(runner.calls, { _start: [[]], _stop: [[]] })
  })
})

test('AbstractRunner start before stop has completed', function (t) {
  t.plan(4)

  const runner = implement({
    _start: setImmediate,
    _stop: setImmediate
  })

  runner.start((err) => {
    t.ifError(err, 'no error')

    runner.stop((err) => {
      t.ifError(err, 'no error')
      t.same(runner.calls, { _start: [[]], _stop: [[]] })
    })

    try {
      runner.start(noop)
    } catch (err) {
      t.is(err.message, 'Cannot start() before stop() has completed')
    }
  })
})

test('AbstractRunner start before stop has completed, with grace', function (t) {
  t.plan(5)

  const runner = implement({
    _start: setImmediate,
    _stop: setImmediate
  })

  runner.start((err) => {
    t.ifError(err, 'no error')

    runner.stop((err) => {
      t.ifError(err, 'no error')
      t.same(runner.calls, { _start: [[]], _stop: [[]] })
    })

    runner.start({ grace: true }, (err) => {
      t.ifError(err, 'no error')
      t.same(runner.calls, { _start: [[], []], _stop: [[]] })
    })
  })
})

test('MultiRunner start and stop', function (t) {
  t.plan(7)

  const multi = new Runner.MultiRunner()
  const order = []

  const a = implement({ _start: setImmediate, _stop: setImmediate }, order)
  const b = implement({ _start: setImmediate, _stop: setImmediate }, order)

  multi.addRunner(a)
  multi.addRunner(b)

  multi.start((err) => {
    t.ifError(err, 'no error')
    t.same(a.calls, { _start: [[]] })
    t.same(b.calls, { _start: [[]] })

    multi.stop((err) => {
      t.ifError(err, 'no error')
      t.same(a.calls, { _start: [[]], _stop: [[]] })
      t.same(b.calls, { _start: [[]], _stop: [[]] })

      t.same(order, [[a, '_start'], [b, '_start'], [a, '_stop'], [b, '_stop']])
    })
  })
})

test('MultiRunner cancels start if 1 runner fails to start', function (t) {
  t.plan(5)

  const multi = new Runner.MultiRunner()
  const order = []
  const reject = (cb) => cb(new Error('nope'))

  const a = implement({ _start: setImmediate, _stop: setImmediate }, order)
  const b = implement({ _start: reject, _stop: setImmediate }, order)
  const c = implement({ _start: setImmediate, _stop: setImmediate }, order)

  multi.addRunner(a)
  multi.addRunner(b)
  multi.addRunner(c)

  multi.start((err) => {
    t.is(err.message, 'nope')
    t.same(a.calls, { _start: [[]], _stop: [[]] })
    t.same(b.calls, { _start: [[]] })
    t.same(c.calls, undefined)
    t.same(order, [[a, '_start'], [b, '_start'], [a, '_stop']])
  })
})

test('MultiRunner start and stop with stopFirst option', function (t) {
  t.plan(7)

  const multi = new Runner.MultiRunner()
  const order = []

  const a = implement({ _start: setImmediate, _stop: setImmediate }, order)
  const b = implement({ _start: setImmediate, _stop: setImmediate }, order)

  multi.addRunner(a)
  multi.addRunner(b, { stopFirst: true })

  multi.start((err) => {
    t.ifError(err, 'no error')
    t.same(a.calls, { _start: [[]] })
    t.same(b.calls, { _start: [[]] })

    multi.stop((err) => {
      t.ifError(err, 'no error')
      t.same(a.calls, { _start: [[]], _stop: [[]] })
      t.same(b.calls, { _start: [[]], _stop: [[]] })

      t.same(order, [[a, '_start'], [b, '_start'], [b, '_stop'], [a, '_stop']])
    })
  })
})
