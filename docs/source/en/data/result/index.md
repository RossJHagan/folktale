@annotate: folktale.data.result
---

A data structure that models the result of operations that may fail. A `Result`
helps with representing errors and propagating them, giving users a more
controllable form of sequencing operations with the power of constructs like
`try/catch`.

A `Result` may be either an `Ok(value)`, which contains a successful value, or
an `Error(value)`, which contains an error.


## Example::

    const Result = require('folktale/data/result');
    const { data, setoid, show } = require('folktale/core/adt');
    
    const DivisionErrors = data('division-errors', {
      DivisionByZero(dividend) {
        return { dividend };
      }
    }).derive(setoid, show);
    
    const { DivisionByZero } = DivisionErrors;
    
    
    const divideBy = (dividend, divisor) => 
      divisor === 0 ?  Result.Error(DivisionByZero(dividend))
    : /* otherwise */  Result.Ok(Math.floor(dividend / divisor));
    
    divideBy(4, 2);
    // ==> Result.Ok(2)
    
    divideBy(4, 0);
    // ==> Result.Error(DivisionByZero(4))


## Why use Result?

Sometimes functions fail, for many reasons: someone might have provided an
unexpected value to it, the internet connection might have gone down in the
middle of an HTTP request, the database might have died. Regardless of which
reason, we have to handle these failures. And, of course, we'd like to handle
failures in the simplest way possible.

In JavaScript you're often left with two major ways of dealing with these
failures: a branching instruction (like `if/else`), or throwing errors and
catching them.

To see how `Result` compares to these, we'll look at a function that needs to
validate some information, and that incorporates some more complex validation
rules. A person may sign-up for a service by providing the form they would
prefer being contacted (email or phone), and the information related to that
preference has to be provided, but any other info is optional::

    // Functions to assert the format of each data
    const isValidName  = (name)  => name.trim() !== '';
    const isValidEmail = (email) => /(.+)@(.+)/.test(email);
    const isValidPhone = (phone) => /^\d+$/.test(phone);

    // Objects representing each possible failure in the validation
    const { data, setoid } = require('folktale/core/adt');
    
    const ValidationErrors = data('validation-errors', {
      Required(field) {
        return { field };
      },
      
      InvalidEmail(email) {
        return { email };
      },
      
      InvalidPhone(phone) {
        return { phone };
      },
      
      InvalidType(type) {
        return { type };
      },
      
      Optional(error) {
        return { error };
      }
    }).derive(setoid);
    
    const { 
      Required, 
      InvalidEmail, 
      InvalidPhone, 
      InvalidType, 
      Optional 
    } = ValidationErrors;

Branching stops being a very feasible thing after a couple of cases. It's very
simple to forget to handle failures (often with catastrophic effects, as can be
seen in things like NullPointerException and the likes), and there's no error
propagation, so every part of the code has to handle the same error over and
over again::

    const validateBranching = ({ name, type, email, phone }) => {
      if (!isValidName(name)) {
        return Required('name');
      } else if (type === 'email') {
        if (!isValidEmail(email)) {
          return InvalidEmail(email);
        } else if (phone && !isValidPhone(phone)) {
          return Optional(InvalidPhone(phone));
        } else {
          return { type, name, email, phone };
        }
      } else if (type === 'phone') {
        if (!isValidPhone(phone)) {
          return InvalidPhone(phone);
        } else if (email && !isValidEmail(email)) {
          return Optional(InvalidEmail(email));
        } else {
          return { type, name, email, phone };
        }
      } else {
        return InvalidType(type);
      }
    };
    
    
    validateBranching({
      name: 'Max',
      type: 'email',
      phone: '11234456'
    });
    // ==> InvalidEmail(undefined)
    
    validateBranching({
      name: 'Alissa',
      type: 'email',
      email: 'alissa@somedomain'
    });
    // ==> { type: 'email', name: 'Alissa', email: 'alissa@somedomain', phone: undefined }


Exceptions (with the `throw` and `try/catch` constructs) alleviate this a bit.
They don't solve the cases where you forget to handle a failure—although that
often results in crashing the process, which is better than continuing but doing
the wrong thing—, but they allow failures to propagate, so fewer places in the
code need to really deal with the problem::

    const id = (a) => a;

    const assertEmail = (email, wrapper=id) => {
      if (!isValidEmail(email)) {
        throw wrapper(InvalidEmail(email));
      }
    };
    
    const assertPhone = (phone, wrapper=id) => {
      if (!isValidPhone(phone)) {
        throw wrapper(InvalidEmail(email));
      }
    };

    const validateThrow = ({ name, type, email, phone }) => {
      if (!isValidName(name)) {
        throw Required('name');
      }
      switch (type) {
        case 'email':
          assertEmail(email);
          if (phone)  assertPhone(phone, Optional);
          return { type, name, email, phone };
          
        case 'phone':
          assertPhone(phone);
          if (email)  assertEmail(email, Optional);
          return { type, name, email, phone };
          
        default:
          throw InvalidType(type);
      }
    };


    try {
      validateThrow({
        name: 'Max',
        type: 'email',
        phone: '11234456'
      });
    } catch (e) {
      e; // ==> InvalidEmail(undefined)
    }
    
    validateThrow({
      name: 'Alissa',
      type: 'email',
      email: 'alissa@somedomain'
    });
    // ==> { type: 'email', name: 'Alissa', email: 'alissa@somedomain', phone: undefined }
    

On the other hand, the error propagation that we have with `throw` doesn't tell
us much about how much of the code has actually been executed, and this is
particularly problematic when you have side-effects. How are you supposed to
recover from a failure when you don't know in which state your application is?

`Result` helps with both of these cases. With a `Result`, the user is forced to
be aware of the failure, since they're not able to use the value at all without
unwrapping the value first. At the same time, using a `Result` value will
automatically propagate the errors when they're not handled, making error
handling easier. Since `Result` runs one operation at a time when you use the
value, and does not do any dynamic stack unwinding (as `throw` does), it's much
easier to understand in which state your application should be.

Using `Result`, the previous examples would look like this::

    const Result = require('folktale/data/result');
    
    const checkName = (name) =>
      isValidName(name) ?  Result.Ok(name)
    : /* otherwise */      Result.Error(Required('name'));
    
    const checkEmail = (email) =>
      isValidEmail(email) ?  Result.Ok(email)
    : /* otherwise */        Result.Error(InvalidEmail(email));
    
    const checkPhone = (phone) =>
      isValidPhone(phone) ?  Result.Ok(phone)
    : /* otherwise */        Result.Error(InvalidPhone(phone));
    
    const optional = (check) => (value) =>
      value           ?  check(value).mapError(Optional)
    : /* otherwise */    Result.Ok(value);
    
    const maybeCheckEmail = optional(checkEmail);
    const maybeCheckPhone = optional(checkPhone);
    

    const validateResult = ({ name, type, email, phone }) =>
      checkName(name).chain(_ => 
        type === 'email' ?  checkEmail(email).chain(_ =>
                              maybeCheckPhone(phone).map(_ => ({
                                name, type, email, phone
                              }))
                            )
                            
      : type === 'phone' ?  checkPhone(phone).chain(_ =>
                              maybeCheckEmail(email).map(_ => ({
                                name, type, email, phone
                              }))
                            )
                            
      : /* otherwise */     Result.Error(InvalidType(type))
      );


    validateResult({
      name: 'Max',
      type: 'email',
      phone: '11234456'
    });
    // ==> Result.Error(InvalidEmail(undefined))
    
    validateResult({
      name: 'Alissa',
      type: 'email',
      email: 'alissa@somedomain'
    });
    // => Result.Ok({ name: 'Alissa', type: 'email', phone: undefined, email: 'alissa@somedomain' })


