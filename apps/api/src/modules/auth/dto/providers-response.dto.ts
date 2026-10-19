import { ApiProperty } from '@nestjs/swagger';

export class ProvidersResponseDto {
  @ApiProperty({ description: 'Whether the "Sign in with Google" button should be shown.' })
  google: boolean;
}
