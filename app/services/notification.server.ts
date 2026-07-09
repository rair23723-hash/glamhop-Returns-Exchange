import {
  getReturnSubmittedTemplate,
  getExchangeSubmittedTemplate,
  getRequestApprovedTemplate,
  getRequestRejectedTemplate,
  getRefundTemplate,
  getReplacementShipmentTemplate,
  getRequestClosedTemplate,
  type EmailTemplatePayload,
} from "./emailTemplates";

// 1. Define abstract notification service provider
export interface NotificationProvider {
  sendWhatsApp(
    to: string,
    templateName: string,
    variables: Record<string, string>
  ): Promise<boolean>;
  sendEmail(to: string, subject: string, htmlContent: string): Promise<boolean>;
}

// 2. Concrete implementations (Mock versions as requested: "Do NOT implement notifications/emails/WhatsApp yet")
export class EmailMockProvider implements NotificationProvider {
  async sendWhatsApp(
    to: string,
    templateName: string,
    variables: Record<string, string>
  ) {
    console.log(
      `[MOCK WHATSAPP] Not sending. Provider: None. To: ${to}. Template: ${templateName}`,
      variables
    );
    return true;
  }
  async sendEmail(to: string, subject: string, _htmlContent: string) {
    console.log(`[MOCK EMAIL] Not sending. Subject: ${subject}. To: ${to}`);
    return true;
  }
}

// Concrete WhatsApp Providers subclasses mapped for WATI, Interakt, AiSensy, and Meta Cloud API
export class WatiProvider extends EmailMockProvider {
  override async sendWhatsApp(
    to: string,
    templateName: string,
    variables: Record<string, string>
  ) {
    console.log(
      `[WATI WHATSAPP] Dispatching message to ${to} using template: ${templateName}`,
      variables
    );
    return true;
  }
}

export class InteraktProvider extends EmailMockProvider {
  override async sendWhatsApp(
    to: string,
    templateName: string,
    variables: Record<string, string>
  ) {
    console.log(
      `[INTERAKT WHATSAPP] Dispatching message to ${to} using template: ${templateName}`,
      variables
    );
    return true;
  }
}

export class AiSensyProvider extends EmailMockProvider {
  override async sendWhatsApp(
    to: string,
    templateName: string,
    variables: Record<string, string>
  ) {
    console.log(
      `[AISENSY WHATSAPP] Dispatching message to ${to} using template: ${templateName}`,
      variables
    );
    return true;
  }
}

export class MetaCloudProvider extends EmailMockProvider {
  override async sendWhatsApp(
    to: string,
    templateName: string,
    variables: Record<string, string>
  ) {
    console.log(
      `[META CLOUD WHATSAPP] Dispatching message to ${to} using template: ${templateName}`,
      variables
    );
    return true;
  }
}

// 3. Central Dispatcher Engine
export class NotificationEngine {
  private provider: NotificationProvider;

  constructor(
    providerType: "MOCK" | "WATI" | "INTERAKT" | "AISENSY" | "META" = "MOCK"
  ) {
    switch (providerType) {
      case "WATI":
        this.provider = new WatiProvider();
        break;
      case "INTERAKT":
        this.provider = new InteraktProvider();
        break;
      case "AISENSY":
        this.provider = new AiSensyProvider();
        break;
      case "META":
        this.provider = new MetaCloudProvider();
        break;
      default:
        this.provider = new EmailMockProvider();
    }
  }

  // Trigger hooks
  async notifyReturnSubmitted(
    toEmail: string,
    toPhone: string,
    p: EmailTemplatePayload
  ) {
    const html = getReturnSubmittedTemplate(p);
    await this.provider.sendEmail(
      toEmail,
      `Return Request Submitted - ${p.requestId}`,
      html
    );
    await this.provider.sendWhatsApp(toPhone, "return_submitted", {
      requestId: p.requestId,
      customerName: p.customerName,
      orderNumber: p.orderNumber,
    });
  }

  async notifyExchangeSubmitted(
    toEmail: string,
    toPhone: string,
    p: EmailTemplatePayload
  ) {
    const html = getExchangeSubmittedTemplate(p);
    await this.provider.sendEmail(
      toEmail,
      `Exchange Request Submitted - ${p.requestId}`,
      html
    );
    await this.provider.sendWhatsApp(toPhone, "exchange_submitted", {
      requestId: p.requestId,
      customerName: p.customerName,
      orderNumber: p.orderNumber,
    });
  }

  async notifyApproved(
    toEmail: string,
    toPhone: string,
    p: EmailTemplatePayload
  ) {
    const html = getRequestApprovedTemplate(p);
    await this.provider.sendEmail(
      toEmail,
      `Return Request Approved - ${p.requestId}`,
      html
    );
    await this.provider.sendWhatsApp(toPhone, "request_approved", {
      requestId: p.requestId,
      customerName: p.customerName,
      orderNumber: p.orderNumber,
    });
  }

  async notifyRejected(
    toEmail: string,
    toPhone: string,
    p: EmailTemplatePayload
  ) {
    const html = getRequestRejectedTemplate(p);
    await this.provider.sendEmail(
      toEmail,
      `Return Request Update - ${p.requestId}`,
      html
    );
    await this.provider.sendWhatsApp(toPhone, "request_rejected", {
      requestId: p.requestId,
      customerName: p.customerName,
      orderNumber: p.orderNumber,
      reason: p.rejectionReason || "",
    });
  }

  async notifyRefundProcessed(
    toEmail: string,
    toPhone: string,
    p: EmailTemplatePayload
  ) {
    const html = getRefundTemplate(p);
    await this.provider.sendEmail(
      toEmail,
      `Refund Processed - ${p.requestId}`,
      html
    );
    await this.provider.sendWhatsApp(toPhone, "refund_processed", {
      requestId: p.requestId,
      customerName: p.customerName,
      amount: p.refundAmount || "",
    });
  }

  async notifyReplacementDispatched(
    toEmail: string,
    toPhone: string,
    p: EmailTemplatePayload
  ) {
    const html = getReplacementShipmentTemplate(p);
    await this.provider.sendEmail(
      toEmail,
      `Replacement Dispatched - ${p.requestId}`,
      html
    );
    await this.provider.sendWhatsApp(toPhone, "replacement_shipped", {
      requestId: p.requestId,
      customerName: p.customerName,
      trackingNumber: p.trackingNumber || "",
    });
  }

  async notifyRequestClosed(
    toEmail: string,
    toPhone: string,
    p: EmailTemplatePayload
  ) {
    const html = getRequestClosedTemplate(p);
    await this.provider.sendEmail(
      toEmail,
      `Request Closed - ${p.requestId}`,
      html
    );
    await this.provider.sendWhatsApp(toPhone, "request_closed", {
      requestId: p.requestId,
      customerName: p.customerName,
    });
  }
}
