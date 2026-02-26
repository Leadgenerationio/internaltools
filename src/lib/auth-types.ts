import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      companyId: string;
      companyName: string;
      role: string;
    };
  }

  interface User {
    companyId?: string;
    companyName?: string;
    role?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    companyId?: string;
    companyName?: string;
    role?: string;
  }
}
