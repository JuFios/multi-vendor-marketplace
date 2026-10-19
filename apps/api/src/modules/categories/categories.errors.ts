import { AppError, ConflictError, NotFoundError } from '../../common/exceptions';

export class CategoryNotFoundError extends NotFoundError {
  constructor() {
    super('Category not found', 'CATEGORY_NOT_FOUND');
  }
}

export class CategorySlugTakenError extends ConflictError {
  constructor() {
    super('A category with this slug already exists', 'CATEGORY_SLUG_TAKEN');
  }
}

export class CategoryInUseError extends ConflictError {
  constructor() {
    super('The category has products or subcategories', 'CATEGORY_IN_USE');
  }
}

export class CategoryParentInvalidError extends AppError {
  constructor(message: string) {
    super('CATEGORY_PARENT_INVALID', 400, message);
  }
}
