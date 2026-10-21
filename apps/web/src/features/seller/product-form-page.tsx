import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router';

import { Button, ButtonLink } from '../../components/button';
import { Card } from '../../components/card';
import { ErrorState } from '../../components/error-state';
import { Input } from '../../components/input';
import { Select } from '../../components/select';
import { Skeleton } from '../../components/skeleton';
import { StatusBadge } from '../../components/status-badge';
import { Textarea } from '../../components/textarea';
import { useToast } from '../../components/toast-context';
import { errorMessage } from '../../lib/api/error-message';
import { isApiError } from '../../lib/api/errors';
import { queryKeys } from '../../lib/query-keys';
import { fetchCategories } from '../catalog/catalog-api';

import {
  buildProductSchema,
  EMPTY_PRODUCT_FORM,
  toCreateBody,
  toUpdateBody,
  type ProductFormValues,
} from './product-schema';
import {
  createProduct,
  fetchSellerProduct,
  setProductStock,
  updateProduct,
  type SellerProduct,
} from './seller-api';

function valuesOf(product: SellerProduct): ProductFormValues {
  return {
    ...EMPTY_PRODUCT_FORM,
    type: product.type,
    categoryId: product.categoryId,
    title: product.title,
    description: product.description,
    images: product.images.join('\n'),
    price: product.priceCents === null ? '' : (product.priceCents / 100).toFixed(2),
  };
}

function StockControl({ product }: { product: SellerProduct }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [stock, setStock] = useState(String(product.stock));
  const parsed = Number(stock);
  const valid =
    stock.trim() !== '' && Number.isInteger(parsed) && parsed >= 0 && parsed <= 1_000_000;
  const save = useMutation({
    mutationFn: () =>
      setProductStock({ id: product.id, stock: parsed, expectedVersion: product.version }),
    onSuccess: (updated) => {
      toast.push('Stock updated', 'ok');
      queryClient.setQueryData(queryKeys.sellerProduct(product.id), updated);
      void queryClient.invalidateQueries({ queryKey: ['seller', 'products'] });
    },
    onError: (error) => {
      // Units sold meanwhile: load the current stock and version, keep what the seller typed.
      if (isApiError(error) && error.code === 'PRODUCT_VERSION_CONFLICT') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.sellerProduct(product.id) });
      }
    },
  });
  return (
    <Card className="space-y-2">
      <h2 className="font-semibold">Stock</h2>
      <div className="flex items-start gap-2">
        <div className="w-32">
          <Input
            label="Units in stock"
            type="number"
            min={0}
            value={stock}
            error={valid ? undefined : '0 – 1,000,000'}
            onChange={(event) => {
              setStock(event.target.value);
            }}
          />
        </div>
        <Button
          className="mt-6"
          disabled={!valid || parsed === product.stock}
          loading={save.isPending}
          onClick={() => {
            save.mutate();
          }}
        >
          Update stock
        </Button>
      </div>
      {save.isError ? (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(save.error)}
          {isApiError(save.error) && save.error.code === 'PRODUCT_VERSION_CONFLICT'
            ? ` Now in stock: ${String(product.stock)}.`
            : null}
        </p>
      ) : null}
    </Card>
  );
}

function ProductForm({ product }: { product?: SellerProduct }) {
  const editing = product !== undefined;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const categories = useQuery({ queryKey: queryKeys.categories, queryFn: fetchCategories });
  const schema = useMemo(() => buildProductSchema(editing ? 'edit' : 'create'), [editing]);
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(schema),
    defaultValues: editing ? valuesOf(product) : EMPTY_PRODUCT_FORM,
  });
  const type = useWatch({ control: form.control, name: 'type' });
  const errors = form.formState.errors;

  const save = useMutation({
    mutationFn: (values: ProductFormValues) =>
      editing
        ? updateProduct({ id: product.id, body: toUpdateBody(values) })
        : createProduct(toCreateBody(values)),
    onSuccess: () => {
      toast.push(editing ? 'Product saved' : 'Product created', 'ok');
      void queryClient.invalidateQueries({ queryKey: ['seller'] });
      void navigate('/seller/products');
    },
  });

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={(event) => {
        void form.handleSubmit((values) => {
          save.mutate(values);
        })(event);
      }}
    >
      <Card className="space-y-4 p-5">
        <Select label="Type" disabled={editing} {...form.register('type')}>
          <option value="FIXED_PRICE">Fixed price</option>
          <option value="AUCTION">Auction</option>
        </Select>
        <Select
          label="Category"
          error={errors.categoryId?.message}
          {...form.register('categoryId')}
        >
          <option value="">Choose…</option>
          {categories.data?.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
        <Input label="Title" error={errors.title?.message} {...form.register('title')} />
        <Textarea
          id="description"
          label="Description"
          error={errors.description?.message}
          rows={5}
          {...form.register('description')}
        />
        <Textarea
          id="images"
          label="Image URLs (one per line, up to 5)"
          className="font-mono text-xs"
          error={errors.images?.message}
          rows={3}
          {...form.register('images')}
        />
      </Card>

      {type === 'FIXED_PRICE' ? (
        <Card className="grid gap-4 p-5 sm:grid-cols-2">
          <Input
            label="Price"
            inputMode="decimal"
            error={errors.price?.message}
            {...form.register('price')}
          />
          {!editing ? (
            <Input
              label="Initial stock"
              inputMode="numeric"
              error={errors.stock?.message}
              {...form.register('stock')}
            />
          ) : null}
        </Card>
      ) : !editing ? (
        <Card className="grid gap-4 p-5 sm:grid-cols-3">
          <Input
            label="Starting price"
            inputMode="decimal"
            error={errors.startPrice?.message}
            {...form.register('startPrice')}
          />
          <Input
            label="Bid step"
            inputMode="decimal"
            error={errors.bidStep?.message}
            {...form.register('bidStep')}
          />
          <Input
            label="Ends at"
            type="datetime-local"
            error={errors.endsAt?.message}
            {...form.register('endsAt')}
          />
        </Card>
      ) : (
        <p className="text-sm text-muted">
          Auction terms cannot be changed after the lot is created.
        </p>
      )}

      {save.isError ? (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(save.error)}
        </p>
      ) : null}
      <div className="flex gap-3">
        <Button type="submit" loading={save.isPending}>
          {editing ? 'Save changes' : 'Create product'}
        </Button>
        <ButtonLink to="/seller/products" variant="secondary">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}

export function NewProductPage() {
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">New product</h1>
      <ProductForm />
    </div>
  );
}

export function EditProductPage() {
  const { id = '' } = useParams();
  const product = useQuery({
    queryKey: queryKeys.sellerProduct(id),
    queryFn: () => fetchSellerProduct(id),
  });

  if (product.isPending) {
    return <Skeleton className="h-80 max-w-2xl" />;
  }
  if (product.isError) {
    return (
      <ErrorState message="Could not load this product." onRetry={() => void product.refetch()} />
    );
  }
  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">Edit product</h1>
        <StatusBadge status={product.data.moderationStatus} />
      </div>
      {product.data.moderationStatus === 'REJECTED' && product.data.moderationReason ? (
        <p className="rounded-md bg-red-50 p-3 text-sm text-danger">
          Rejected by a moderator: {product.data.moderationReason}
        </p>
      ) : null}
      {product.data.type === 'FIXED_PRICE' ? <StockControl product={product.data} /> : null}
      <ProductForm key={product.data.updatedAt} product={product.data} />
    </div>
  );
}
