import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ErrorBodyDto {
  @ApiProperty({ example: 'VALIDATION_FAILED', description: 'Stable machine-readable error code.' })
  code!: string;

  @ApiProperty({ example: 'Request validation failed' })
  message!: string;

  @ApiPropertyOptional({
    description: 'Extra context; for VALIDATION_FAILED a list of `{ field, messages }` entries.',
    example: [{ field: 'priceCents', messages: ['priceCents must be an integer number'] }],
  })
  details?: unknown;

  @ApiProperty({
    example: '4f6c1d0e-9a77-4c1b-8f0e-5d3a2b1c9e10',
    description: 'Echo of the `X-Request-Id` response header; quote it when reporting a problem.',
  })
  correlationId!: string;
}

/** Shape of every non-2xx response. */
export class ErrorResponseDto {
  @ApiProperty({ type: ErrorBodyDto })
  error!: ErrorBodyDto;
}
