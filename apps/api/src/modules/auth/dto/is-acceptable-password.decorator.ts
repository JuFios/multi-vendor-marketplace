import { registerDecorator, type ValidationOptions } from 'class-validator';

import { checkPasswordPolicy, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../password-policy';

export function IsAcceptablePassword(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyKey) => {
    registerDecorator({
      name: 'isAcceptablePassword',
      target: target.constructor,
      propertyName: propertyKey as string,
      ...(options ? { options } : {}),
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && checkPasswordPolicy(value).length === 0,
        defaultMessage: () =>
          `password must be ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters long and contain a letter and a digit`,
      },
    });
  };
}
