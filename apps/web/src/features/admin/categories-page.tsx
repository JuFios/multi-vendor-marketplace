import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { EmptyState } from '../../components/empty-state';
import { ErrorState } from '../../components/error-state';
import { Input } from '../../components/input';
import { Modal } from '../../components/modal';
import { Select } from '../../components/select';
import { Skeleton } from '../../components/skeleton';
import { useToast } from '../../components/toast-context';
import { errorMessage } from '../../lib/api/error-message';
import { isApiError } from '../../lib/api/errors';
import { queryKeys } from '../../lib/query-keys';
import { fetchCategories } from '../catalog/catalog-api';

import { createCategory, deleteCategory, updateCategory, type Category } from './admin-api';
import { categorySchema, slugify, type CategoryValues } from './category-schema';
import { flattenTree } from './category-tree';

function failure(error: unknown): string {
  if (isApiError(error) && error.code === 'CATEGORY_IN_USE') {
    return 'This category still has products or subcategories.';
  }
  if (isApiError(error) && error.code === 'CATEGORY_SLUG_TAKEN') {
    return 'Another category already uses this slug.';
  }
  return errorMessage(error);
}

function CategoryForm({
  categories,
  editing,
  onDone,
}: {
  categories: readonly Category[];
  editing: Category | null;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const form = useForm<CategoryValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: editing?.name ?? '',
      slug: editing?.slug ?? '',
      parentId: editing?.parentId ?? '',
    },
  });
  const save = useMutation({
    mutationFn: (values: CategoryValues) =>
      editing === null
        ? createCategory({
            name: values.name,
            slug: values.slug === '' ? slugify(values.name) : values.slug,
            ...(values.parentId !== '' && { parentId: values.parentId }),
          })
        : updateCategory({
            id: editing.id,
            body: {
              name: values.name,
              ...(values.slug !== '' && { slug: values.slug }),
              parentId: values.parentId === '' ? null : values.parentId,
            },
          }),
    onSuccess: () => {
      toast.push(editing === null ? 'Category created' : 'Category saved', 'ok');
      void queryClient.invalidateQueries({ queryKey: queryKeys.categories });
      onDone();
    },
  });
  const options = categories.filter((category) => category.id !== editing?.id);

  return (
    <form
      noValidate
      className="space-y-3"
      onSubmit={(event) => {
        void form.handleSubmit((values) => {
          save.mutate(values);
        })(event);
      }}
    >
      <Input label="Name" error={form.formState.errors.name?.message} {...form.register('name')} />
      <Input
        label="Slug (generated from the name if empty)"
        error={form.formState.errors.slug?.message}
        {...form.register('slug')}
      />
      <Select label="Parent category" {...form.register('parentId')}>
        <option value="">None (top level)</option>
        {flattenTree(options).map(({ category, depth }) => (
          <option key={category.id} value={category.id}>
            {'— '.repeat(depth)}
            {category.name}
          </option>
        ))}
      </Select>
      {save.isError ? (
        <p role="alert" className="text-sm text-danger">
          {failure(save.error)}
        </p>
      ) : null}
      <Button type="submit" loading={save.isPending}>
        {editing === null ? 'Create category' : 'Save category'}
      </Button>
    </form>
  );
}

export function CategoriesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const categories = useQuery({ queryKey: queryKeys.categories, queryFn: fetchCategories });
  const [form, setForm] = useState<{ editing: Category | null } | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);

  const remove = useMutation({
    mutationFn: (category: Category) => deleteCategory(category.id),
    onSuccess: () => {
      toast.push('Category deleted', 'ok');
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.categories });
    },
  });

  if (categories.isPending) {
    return <Skeleton className="h-48" />;
  }
  if (categories.isError) {
    return (
      <ErrorState message="Could not load categories." onRetry={() => void categories.refetch()} />
    );
  }
  const rows = flattenTree(categories.data);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Categories</h1>
        <Button
          onClick={() => {
            setForm({ editing: null });
          }}
        >
          New category
        </Button>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No categories" detail="Sellers need a category to list products." />
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {rows.map(({ category, depth }) => (
              <li
                key={category.id}
                className="flex items-center justify-between gap-2 py-2 text-sm"
                style={{ paddingLeft: `${depth * 1.5}rem` }}
              >
                <span>
                  {category.name}
                  <span className="ml-2 text-xs text-muted">{category.slug}</span>
                </span>
                <span className="flex gap-1">
                  <Button
                    variant="ghost"
                    aria-label={`Edit ${category.name}`}
                    onClick={() => {
                      setForm({ editing: category });
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={`Delete ${category.name}`}
                    onClick={() => {
                      remove.reset();
                      setDeleting(category);
                    }}
                  >
                    Delete
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal
        open={form !== null}
        title={form?.editing ? 'Edit category' : 'New category'}
        onClose={() => {
          setForm(null);
        }}
      >
        {form !== null ? (
          <CategoryForm
            categories={categories.data}
            editing={form.editing}
            onDone={() => {
              setForm(null);
            }}
          />
        ) : null}
      </Modal>

      <Modal
        open={deleting !== null}
        title="Delete this category?"
        onClose={() => {
          setDeleting(null);
        }}
      >
        <p className="mb-3 text-sm">
          <strong>{deleting?.name}</strong> can only be deleted while it has no products or
          subcategories.
        </p>
        {remove.isError ? (
          <p role="alert" className="mb-3 text-sm text-danger">
            {failure(remove.error)}
          </p>
        ) : null}
        <Button
          variant="danger"
          loading={remove.isPending}
          onClick={() => {
            if (deleting !== null) {
              remove.mutate(deleting);
            }
          }}
        >
          Delete category
        </Button>
      </Modal>
    </div>
  );
}
