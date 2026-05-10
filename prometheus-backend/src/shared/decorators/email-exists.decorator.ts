import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';
import { EmailExists } from '../validarors/existing-email.validator';  // Adjust the path to your custom validator

interface EmailExistsValidationOptions extends ValidationOptions {
  additionalField?: string;
  idField?: string;  // Field name that holds the id value
}

export function EmailExistsValidator(validationOptions?: EmailExistsValidationOptions) {
  //console.log('res')
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'EmailExists',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [validationOptions],
      validator: EmailExists,
    });
  };
}