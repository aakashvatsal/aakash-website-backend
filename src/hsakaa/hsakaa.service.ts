import { Injectable } from '@nestjs/common';

@Injectable()
export class HsakaaService {
  async ask(body: {
    mode: string;
    message: string;
  }) {
    return {
      answer:
        "I’m still taking over Aakash’s memories and connected systems. I’m not fully ready yet, but I’ll be done soon.",
    };
  }
}