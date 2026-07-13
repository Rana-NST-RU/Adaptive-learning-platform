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
  // Override canActivate to NEVER throw — missing/invalid token => user is null
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      await super.canActivate(context);
    } catch {
      // No token or invalid token — continue as anonymous
    }
    return true; // always allow the request through
  }

  override handleRequest(_err: any, user: any) {
    // Return user if valid, null otherwise — no exception thrown
    return user || null;
  }
}
