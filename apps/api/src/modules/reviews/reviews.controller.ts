import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { Public } from '../../common/decorators/public.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ParseUuidPipe } from '../../common/pipes/parse-uuid.pipe';
import { ApiErrorResponses } from '../../common/swagger/api-error-responses.decorator';
import { BEARER_AUTH } from '../../common/swagger/openapi';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { CreateReviewDto } from './dto/create-review.dto';
import { ReviewEligibilityDto, ReviewPageDto, ReviewResponseDto } from './dto/review-response.dto';
import { ReviewsService } from './reviews.service';

@ApiTags('reviews')
@Controller('products/:id/reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Reviews of a published product, newest first.' })
  @ApiOkResponse({ type: ReviewPageDto })
  @ApiErrorResponses(400, 404)
  list(
    @Param('id', ParseUuidPipe) id: string,
    @Query() query: PaginationQueryDto,
  ): Promise<ReviewPageDto> {
    return this.reviews.list(id, query.page, query.limit);
  }

  @Get('eligibility')
  @ApiBearerAuth(BEARER_AUTH)
  @ApiOperation({ summary: 'Whether the caller may review the product now.' })
  @ApiOkResponse({ type: ReviewEligibilityDto })
  @ApiErrorResponses(400, 401, 404)
  eligibility(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUuidPipe) id: string,
  ): Promise<ReviewEligibilityDto> {
    return this.reviews.eligibility(user.userId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth(BEARER_AUTH)
  @ApiOperation({ summary: 'Reviews a product the caller has bought and received.' })
  @ApiCreatedResponse({ type: ReviewResponseDto })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  create(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: CreateReviewDto,
  ): Promise<ReviewResponseDto> {
    return this.reviews.create(user.userId, id, dto);
  }
}
