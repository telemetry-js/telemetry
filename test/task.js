'use strict'

const test = require('tape')
const Task = require('../lib/task')
const EventEmitter = require('events').EventEmitter
const implement = require('./util/implement')(EventEmitter)
const mainModule = require('..')

test('task is an export of main module', function (t) {
  t.is(typeof mainModule.Task, 'function')
  t.end()
})

test('can set task name', function (t) {
  t.is(mainModule().task('beep')._name, 'Task(beep)', 'via Telemetry')
  t.is(mainModule.Task('boop')._name, 'Task(boop)', 'via standalone Task')
  t.is(mainModule().task()._name, 'Task(anonymous)', 'optional via Telemetry')
  t.is(mainModule.Task()._name, 'Task(anonymous)', 'optional via standalone Task')
  t.end()
})

test('task.start() and .stop() order', function (t) {
  t.plan(4)

  const task = new Task()
  const order = []
  const collector = implement({ start: setImmediate, stop: setImmediate }, order, 'collector')
  const scheduler = implement({ start: setImmediate, stop: setImmediate }, order, 'scheduler')
  const processor = implement({ start: setImmediate, stop: setImmediate }, order, 'processor')
  const publisher = implement({ start: setImmediate, stop: setImmediate }, order, 'publisher')

  task
    .collect(() => collector)
    .schedule(() => scheduler)
    .process(() => processor)
    .publish(() => publisher)

  task.start((err) => {
    t.ifError(err, 'no task start error')
    t.same(order, [
      ['collector', 'start'],
      ['processor', 'start'],
      ['publisher', 'start'],
      ['scheduler', 'start']
    ], 'schedule is started last')

    order.length = 0

    task.stop((err) => {
      t.ifError(err, 'no task stop error')
      t.same(order, [
        ['scheduler', 'stop'],
        ['collector', 'stop'],
        ['processor', 'stop'],
        ['publisher', 'stop']
      ], 'schedule is stopped first')
    })
  })
})

test('add multiple plugins to task at once', function (t) {
  const methods = ['collect', 'schedule', 'process', 'publish', 'use']

  t.plan(8 * methods.length)

  for (const method of methods) {
    const task = new Task()
    const order = []
    const plugin1 = implement({ start: setImmediate, stop: setImmediate }, order, 'plugin1')
    const plugin2 = implement({ start: setImmediate, stop: setImmediate }, order, 'plugin2')
    const plugin3 = implement({ start: setImmediate, stop: setImmediate }, order, 'plugin3')

    task
      .collect((options, task_) => {
        t.same(options, {}, `${method} plugin 1: got options object`)
        t.is(task_, task, `${method} plugin 1: got task`)

        return plugin1
      })
      .collect([
        (options, task_) => {
          t.same(options, {}, `${method} plugin 2: got options object`)
          t.is(task_, task, `${method} plugin 2: got task`)

          return plugin2
        },
        [(options, task_) => {
          t.same(options, { foo: true }, `${method} plugin 3: got options object`)
          t.is(task_, task, `${method} plugin 3: got task`)

          return plugin3
        }, { foo: true }]
      ])

    task.start((err) => {
      t.ifError(err, `${method}: no task start error`)
      t.same(order, [
        ['plugin1', 'start'],
        ['plugin2', 'start'],
        ['plugin3', 'start']
      ], `${method}: started all plugins`)
    })
  }
})

test('task.ping() pings collectors, processors and publishers', function (t) {
  t.plan(12)

  const task = new Task('test')
  const order = []
  const collector = implement({ start: setImmediate, ping }, order, 'collector')
  const collector2 = implement({ start: setImmediate, ping }, order, 'collector2')
  const scheduler = implement({ start: setImmediate, ping }, order, 'scheduler')
  const processor = implement({ start: setImmediate, ping }, order, 'processor')
  const publisher = implement({ start: setImmediate, ping }, order, 'publisher')

  const expectedNames = [
    '<Task(test):Collector[0]:Test>',
    '<Task(test):Collector[1]:Test>',
    '<Task(test):Processor[0]:Test>',
    '<Task(test):Publisher[0]:Test>',
    '<Task(test):Publisher[1]:Object>',
    '<Task(test):Publisher[3]:Object>'
  ]

  task
    .collect(() => collector)
    .collect(() => collector2)
    .schedule(() => scheduler)
    .process(() => processor)
    .publish(() => publisher)
    .publish(() => ({ start: setImmediate, ping }))
    .publish(() => ({})) // Will not be pinged
    .publish(() => ({ start: setImmediate, ping }))

  task.start((err) => {
    t.ifError(err, 'no task start error')
    t.is(task.currentPingTarget(), '<Task(test):None>')

    order.length = 0
    let sync = true

    task.ping((err) => {
      t.ifError(err, 'no task ping error')
      t.is(sync, false, 'dezalgoed')
      t.is(task.currentPingTarget(), '<Task(test):None>')
      t.same(order, [
        ['collector', 'ping'],
        ['collector2', 'ping'],
        ['processor', 'ping'],
        ['publisher', 'ping']
      ])
    })

    sync = false
  })

  function ping (callback) {
    t.is(task.currentPingTarget(), expectedNames.shift())
    callback()
  }
})

test('task.ping() throws if previous ping has not completed yet', function (t) {
  t.plan(3)

  const task = new Task()
  const collector = implement({ start: setImmediate, ping: setImmediate })

  task.collect(() => collector)

  task.start((err) => {
    t.ifError(err, 'no task start error')

    task.ping((err) => {
      t.ifError(err, 'no task ping error')
    })

    try {
      task.ping(() => {
        t.fail('should not be called')
      })
    } catch (err) {
      t.is(err.message, 'Cannot ping() before completion of previous ping')
    }
  })
})

test('task.ping() can be called multiple times', function (t) {
  t.plan(3)

  const task = new Task()
  const collector = implement({ start: setImmediate, ping: setImmediate })

  task.collect(() => collector)

  task.start((err) => {
    t.ifError(err, 'no task start error')

    task.ping((err) => {
      t.ifError(err, 'no task ping error')

      task.ping((err) => {
        t.ifError(err, 'no task ping error')
      })
    })
  })
})

test('task.ping() skips plugin if it does not have a ping() method', function (t) {
  t.plan(3)

  const task = new Task()
  const order = []
  const collector1 = implement({ start: setImmediate, ping: setImmediate }, order, 'collector1')
  const collector2 = implement({ start: setImmediate }, order, 'collector2')
  const collector3 = implement({ start: setImmediate, ping: setImmediate }, order, 'collector3')

  task.collect([() => collector1, () => collector2, () => collector3])

  task.start((err) => {
    t.ifError(err, 'no task start error')
    order.length = 0

    task.ping((err) => {
      t.ifError(err, 'no task ping error')
      t.same(order, [
        ['collector1', 'ping'],
        ['collector3', 'ping']
      ])
    })
  })
})
