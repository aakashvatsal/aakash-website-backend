import { createParamDecorator, ExecutionContext } from '@nestjs/common';

type OwnerRequest = {
  user: unknown;
};

export const CurrentOwner = createParamDecorator(
  (_data: unknown, context: ExecutionContext): unknown => {
    const request = context.switchToHttp().getRequest<OwnerRequest>();

    return request.user;
  },
);
