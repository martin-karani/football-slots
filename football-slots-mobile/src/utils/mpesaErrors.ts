export interface MpesaClassification {
  code: number | null;
  category: 'paid' | 'unreachable' | 'cancelled' | 'insufficient' | 'wrong_pin' | 'busy' | 'platform_error';
  title: string;
  message: string;
  actionText: string;
  canRetry: boolean;
  retryCooldownSecs: number;
  reassureNoCharge: boolean;
}

/**
 * Masks a phone number to reveal only the prefix and the last 3 digits
 * e.g. "0712345678" -> "0712 ••• 678" or "254708374149" -> "0708 ••• 149"
 */
export function maskPhoneNumber(phone?: string): string {
  if (!phone) return 'your phone';
  const clean = phone.replace(/\s+/g, '');
  
  let formatted = clean;
  if (formatted.startsWith('254') && formatted.length === 12) {
    formatted = '0' + formatted.slice(3);
  }
  
  if (formatted.length >= 9) {
    const prefix = formatted.slice(0, 4);
    const suffix = formatted.slice(-3);
    return `${prefix} ••• ${suffix}`;
  }
  return formatted;
}

/**
 * Classifies Safaricom Daraja STK Push ResultCodes into distinct, actionable user experiences.
 * Based on Daraja integration best practices:
 * - 0: Success (Receipt in metadata)
 * - 1037: Prompt never answered / DS timeout (phone locked, no signal, eSIM/SIM toolkit delay)
 * - 1032: User pressed Cancel on prompt
 * - 1: Insufficient M-Pesa balance
 * - 2001: Wrong PIN entered
 * - 1001: Subscriber busy / already in session
 */
export function classifyMpesaResult(
  resultCode?: number | null,
  resultDesc?: string | null,
  phoneNumber?: string
): MpesaClassification {
  const masked = maskPhoneNumber(phoneNumber);

  if (resultCode === 0) {
    return {
      code: 0,
      category: 'paid',
      title: 'Payment Successful',
      message: 'Your payment was confirmed and your balance has been updated.',
      actionText: 'Done',
      canRetry: false,
      retryCooldownSecs: 0,
      reassureNoCharge: false,
    };
  }

  // 1037: MSISDN Unreachable / No Response From User / DS timeout
  if (resultCode === 1037 || (resultDesc && (resultDesc.toLowerCase().includes('timeout') || resultDesc.toLowerCase().includes('unreachable')))) {
    return {
      code: 1037,
      category: 'unreachable',
      title: 'Could Not Reach Phone',
      message: `We could not reach ${masked}. Make sure the phone is on, unlocked and has network signal, then tap Retry.`,
      actionText: 'Retry Payment',
      canRetry: true,
      retryCooldownSecs: 15,
      reassureNoCharge: true,
    };
  }

  // 1032: User pressed cancel
  if (resultCode === 1032 || (resultDesc && resultDesc.toLowerCase().includes('cancel'))) {
    return {
      code: 1032,
      category: 'cancelled',
      title: 'Payment Cancelled',
      message: `The payment prompt on ${masked} was cancelled. Tap retry when you're ready.`,
      actionText: 'Retry Now',
      canRetry: true,
      retryCooldownSecs: 0,
      reassureNoCharge: true,
    };
  }

  // 1: Insufficient funds
  if (resultCode === 1 || (resultDesc && resultDesc.toLowerCase().includes('balance'))) {
    return {
      code: 1,
      category: 'insufficient',
      title: 'Insufficient M-Pesa Funds',
      message: `Your M-Pesa balance is insufficient for this deposit. Please top up M-Pesa and try again.`,
      actionText: 'Try Again',
      canRetry: true,
      retryCooldownSecs: 0,
      reassureNoCharge: true,
    };
  }

  // 2001: Wrong PIN
  if (resultCode === 2001 || (resultDesc && resultDesc.toLowerCase().includes('pin'))) {
    return {
      code: 2001,
      category: 'wrong_pin',
      title: 'Wrong M-Pesa PIN',
      message: `Incorrect M-Pesa PIN entered. Tap retry to attempt the payment again.`,
      actionText: 'Retry Payment',
      canRetry: true,
      retryCooldownSecs: 0,
      reassureNoCharge: true,
    };
  }

  // 1001: Subscriber busy
  if (resultCode === 1001 || (resultDesc && resultDesc.toLowerCase().includes('subscriber busy'))) {
    return {
      code: 1001,
      category: 'busy',
      title: 'M-Pesa Session Busy',
      message: `Another M-Pesa prompt is active on ${masked}. Please wait a moment for the session to clear.`,
      actionText: 'Retry in a Moment',
      canRetry: true,
      retryCooldownSecs: 25,
      reassureNoCharge: true,
    };
  }

  // Generic fallback
  return {
    code: resultCode ?? null,
    category: 'platform_error',
    title: 'Payment Incomplete',
    message: resultDesc
      ? `${resultDesc}. Tap retry to try again.`
      : `The payment request on ${masked} could not be completed.`,
    actionText: 'Retry Payment',
    canRetry: true,
    retryCooldownSecs: 10,
    reassureNoCharge: true,
  };
}
