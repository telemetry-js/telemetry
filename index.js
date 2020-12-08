'use strict'

const Control = require('./lib/control')
const Task = require('./lib/task')

module.exports = function () {
  return new Control()
}

// TODO (later): move Task to separate package
// TODO: document task name ("to be used for errors and warnings")
module.exports.Task = function (name) {
  return new Task(name)
}
