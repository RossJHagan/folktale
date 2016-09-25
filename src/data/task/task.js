//----------------------------------------------------------------------
//
// This source file is part of the Folktale project.
//
// See LICENCE for licence information.
// See CONTRIBUTORS for the list of contributors to the project.
//
//----------------------------------------------------------------------

const Deferred = require('folktale/data/future/deferred');
const TaskExecution = require('./_task-execution');


const noop = () => {};

const defer = (fn) => process.nextTick(fn);

class Task {
  constructor(computation, onCancel, cleanup) {
    this._computation = computation;
    this._onCancel    = onCancel || noop;
    this._cleanup     = cleanup  || noop;
  }

  chain(transformation) {
    return new Task(
      resolver => {
        const execution = this.run();
        execution.listen({
          onCancelled: resolver.cancel,
          onRejected:  resolver.reject,
          onResolved:  value => {
            transformation(value).run().listen({
              onCancelled: resolver.cancel,
              onRejected:  resolver.reject,
              onResolved:  resolver.resolve
            })
          }
        });
        return execution;
      },
      execution => execution.cancel()
    );
  }

  map(transformation) {
    return new Task(
      resolver => {
        const execution = this.run();
        execution.listen({
          onCancelled: resolver.cancel,
          onRejected:  resolver.reject,
          onResolved:  value => resolver.resolve(transformation(value))
        });
        return execution
      },
      execution => execution.cancel()
    );
  }

  or(that) {
    return new Task(
      resolver => {
        let thisExecution = this.run();
        let thatExecution = that.run();
        let done = false;

        const guard = (fn, execution) => (value) => {
          if (!done) {
            done = true;
            execution.cancel();
            fn(value);
          }
        };

        thisExecution.listen({
          onRejected:  guard(resolver.reject, thatExecution),
          onCancelled: guard(resolver.cancel, thatExecution),
          onResolved:  guard(resolver.resolve, thatExecution)
        });

        thatExecution.listen({
          onRejected:  guard(resolver.reject, thisExecution),
          onCancelled: guard(resolver.cancel, thisExecution),
          onResolved:  guard(resolver.resolve, thisExecution)
        });

        return [thisExecution, thatExecution];
      },
      ([thisExecution, thatExecution]) => {
        thisExecution.cancel();
        thatExecution.cancel();
      }
    );
  }

  and(that) {
    return new Task(
      resolver => {
        let thisExecution = this.run();
        let thatExecution = that.run();
        let valueLeft = null;
        let valueRight = null;
        let doneLeft = false;
        let doneRight = false;
        let cancelled = false;

        const guardResolve = (setter) => (value) => {
          if (cancelled)  return;

          setter(value);
          if (doneLeft && doneRight) {
            resolver.resolve([valueLeft, valueRight]);
          }
        };

        const guardRejection = (fn, execution) => (value) => {
          if (cancelled)  return;

          cancelled = true;
          execution.cancel();
          fn(value);
        }

        thisExecution.listen({
          onRejected:  guardRejection(resolver.reject, thatExecution),
          onCancelled: guardRejection(resolver.cancel, thatExecution),
          onResolved:  guardResolve(x => {
            valueLeft = x;
            doneLeft = true;
          })
        });

        thatExecution.listen({
          onRejected:  guardRejection(resolver.reject, thisExecution),
          onCancelled: guardRejection(resolver.cancel, thisExecution),
          onResolved:  guardResolve(x => {
            valueRight = x;
            doneRight = true;
          })
        });

        return [thisExecution, thatExecution];
      },
      ([thisExecution, thatExecution]) => {
        thisExecution.cancel();
        thatExecution.cancel();
      }
    );
  }

  run() {
    let deferred = new Deferred();
    deferred.listen({
      onCancelled: _ => {
        defer(_ => {
          this._onCancel(resources);
          this._cleanup(resources);
        });
      },

      onResolved: value => {
        defer(_ => {
          this._cleanup(resources);
        });
      },

      onRejected: reason => {
        defer(_ => {
          this._cleanup(resources);
        });
      }
    });

    const resources = this._computation({
      reject:  error => { deferred.reject(error) },
      resolve: value => { deferred.resolve(value) },
      cancel:  _     => { deferred.maybeCancel() }
    });

    return new TaskExecution(this, deferred);
  }
}

const task = (computation, onCancel, cleanup) => 
  new Task(computation, onCancel, cleanup);

module.exports = task;