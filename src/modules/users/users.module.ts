import { Module } from '@nestjs/common';

import { MongooseModule } from '@nestjs/mongoose';

import { User, UserSchema } from './schemas/user.schema';

import { UsersService } from './users.service';

/**
 * Future-facing module.
 *
 * The Personal OS does not use UsersModule for
 * authentication and exposes no /users routes today.
 *
 * Keep the schema/service so the module can be activated
 * later if the product becomes multi-user/public.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: User.name,
        schema: UserSchema,
      },
    ]),
  ],

  providers: [UsersService],

  exports: [UsersService, MongooseModule],
})
export class UsersModule {}
