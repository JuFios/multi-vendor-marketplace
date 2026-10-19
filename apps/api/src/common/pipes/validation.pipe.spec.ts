import type { ArgumentMetadata } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsEmail, IsString, ValidateNested } from 'class-validator';

import { ValidationFailedError } from '../exceptions';

import { createValidationPipe } from './validation.pipe';

class AddressDto {
  @IsString()
  city!: string;
}

class UserDto {
  @IsEmail()
  email!: string;

  @ValidateNested()
  @Type(() => AddressDto)
  address!: AddressDto;
}

const metadata: ArgumentMetadata = { type: 'body', metatype: UserDto };

async function failureOf(value: unknown): Promise<ValidationFailedError> {
  try {
    await createValidationPipe().transform(value, metadata);
  } catch (error) {
    return error as ValidationFailedError;
  }
  throw new Error('expected validation to fail');
}

describe('createValidationPipe', () => {
  it('returns a transformed DTO instance for valid input', async () => {
    const result: unknown = await createValidationPipe().transform(
      { email: 'a@b.co', address: { city: 'Kyiv' } },
      metadata,
    );

    expect(result).toBeInstanceOf(UserDto);
    expect((result as UserDto).address).toBeInstanceOf(AddressDto);
  });

  it('reports failing fields with nested paths', async () => {
    const error = await failureOf({ email: 'nope', address: { city: 5 } });

    expect(error).toBeInstanceOf(ValidationFailedError);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.httpStatus).toBe(400);
    expect(error.details).toEqual([
      { field: 'email', messages: ['email must be an email'] },
      { field: 'address.city', messages: ['city must be a string'] },
    ]);
  });

  it('rejects unknown properties instead of dropping them', async () => {
    const error = await failureOf({ email: 'a@b.co', address: { city: 'Kyiv' }, role: 'admin' });

    expect(error.details).toEqual([
      { field: 'role', messages: ['property role should not exist'] },
    ]);
  });
});
