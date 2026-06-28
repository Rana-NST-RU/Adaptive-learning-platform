import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Optional JWT guard — if a valid Bearer token is present the request is
 * augmented with `req.user`; if no / invalid token is present the request
 * proceeds unauthenticated (req.user === undefined).
 *
 * Use this on endpoints where authentication is optional but unlocks
 * additional functionality (e.g. recording XP / attempts when logged in).
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  // Override to never throw — let the handler decide what to do with req.user
  override canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  override handleRequest(_err: any, user: any) {
    // Return user if available, null otherwise — no exception thrown
    return user ?? null;
  }
}
