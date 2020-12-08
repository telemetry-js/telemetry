'use strict'

const Task = require('./task')
const Runner = require('./runner')

class Control extends Runner.MultiRunner {
  task (name) {
    const task = new Task(name)
    this.addRunner(task)
    return task
  }
}

module.exports = Control
