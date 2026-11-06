import 'dart:async';

import 'package:flutter/material.dart';

import '../app_colors.dart';
import '../services/api_client.dart';
import '../services/app_services.dart';
import '../widgets/common.dart';

/// Nếu chưa đăng nhập thì mở màn hình đăng nhập. Trả true nếu đã đăng nhập.
Future<bool> ensureSignedIn(BuildContext context, AppServices services) async {
  if (services.auth.isSignedIn) return true;
  final ok = await Navigator.of(context).push<bool>(
    MaterialPageRoute(builder: (_) => LoginPage(services: services)),
  );
  return ok == true && services.auth.isSignedIn;
}

// Validation giống server để báo lỗi sớm (FR-U01).
String? validateEmail(String? value) {
  final v = (value ?? '').trim();
  if (v.isEmpty) return 'Nhập email';
  if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(v)) return 'Email không hợp lệ';
  return null;
}

String? validateNewPassword(String? value) {
  final v = value ?? '';
  if (v.length < 8 || v.length > 72) return 'Mật khẩu phải từ 8 đến 72 ký tự';
  if (!RegExp(r'\p{L}', unicode: true).hasMatch(v) || !RegExp(r'\d').hasMatch(v)) {
    return 'Mật khẩu phải có ít nhất một chữ cái và một chữ số';
  }
  return null;
}

String? validateDisplayName(String? value) {
  final v = (value ?? '').trim();
  if (v.length < 2 || v.length > 40) return 'Tên hiển thị phải từ 2 đến 40 ký tự';
  return null;
}

/// Khung chung cho các form tài khoản.
class AuthScaffold extends StatelessWidget {
  const AuthScaffold({super.key, required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.page,
      appBar: AppBar(backgroundColor: AppColors.page, foregroundColor: AppColors.warmText, title: Text(title)),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: ListView(padding: const EdgeInsets.all(20), children: children),
          ),
        ),
      ),
    );
  }
}

/// Hiển thị lỗi server theo trường hoặc lỗi chung.
mixin ServerErrors<T extends StatefulWidget> on State<T> {
  Map<String, String> serverFields = {};
  String? serverMessage;
  bool busy = false;

  /// Chạy [action], bắt ApiException và hiện lỗi. Trả true nếu thành công.
  Future<bool> submit(Future<void> Function() action) async {
    if (busy) return false;
    setState(() {
      busy = true;
      serverFields = {};
      serverMessage = null;
    });
    try {
      await action();
      return true;
    } on ApiException catch (error) {
      if (mounted) {
        setState(() {
          serverFields = error.fields;
          serverMessage = error.fields.isEmpty ? error.message : null;
        });
      }
      rethrowIfNeeded(error);
      return false;
    } catch (error) {
      if (mounted) setState(() => serverMessage = errorText(error));
      return false;
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  /// Lớp con ghi đè để xử lý mã lỗi đặc biệt (ví dụ EMAIL_NOT_VERIFIED).
  void rethrowIfNeeded(ApiException error) {}

  Widget messageBox() => serverMessage == null
      ? const SizedBox.shrink()
      : Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Text(
            serverMessage!,
            key: const Key('auth-error'),
            style: TextStyle(color: Theme.of(context).colorScheme.error),
          ),
        );
}

class LoginPage extends StatefulWidget {
  const LoginPage({super.key, required this.services});

  final AppServices services;

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> with ServerErrors {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (!_form.currentState!.validate()) return;
    String? unverified;
    final ok = await submit(() async {
      try {
        await widget.services.auth.login(_email.text, _password.text);
      } on ApiException catch (error) {
        if (error.code != 'EMAIL_NOT_VERIFIED') rethrow;
        unverified = _email.text.trim();
      }
    });
    if (!mounted) return;
    final email = unverified;
    if (email != null) {
      // Chưa xác minh: gửi lại OTP (bỏ qua lỗi chờ gửi lại) rồi sang màn hình nhập mã.
      try {
        await widget.services.auth.resendOtp(email);
      } on ApiException catch (_) {}
      if (!mounted) return;
      final verified = await Navigator.of(context).push<bool>(MaterialPageRoute(
        builder: (_) => OtpPage(services: widget.services, email: email),
      ));
      if (verified == true && mounted) Navigator.of(context).pop(true);
      return;
    }
    if (ok && widget.services.auth.isSignedIn) Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    return AuthScaffold(title: 'Đăng nhập', children: [
      Form(
        key: _form,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          TextFormField(
            key: const Key('login-email'),
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            autofillHints: const [AutofillHints.email],
            decoration: InputDecoration(labelText: 'Email', errorText: serverFields['email']),
            validator: validateEmail,
          ),
          const SizedBox(height: 12),
          TextFormField(
            key: const Key('login-password'),
            controller: _password,
            obscureText: true,
            autofillHints: const [AutofillHints.password],
            decoration: InputDecoration(labelText: 'Mật khẩu', errorText: serverFields['password']),
            validator: (v) => (v ?? '').isEmpty ? 'Nhập mật khẩu' : null,
            onFieldSubmitted: (_) => _login(),
          ),
          const SizedBox(height: 16),
          messageBox(),
          FilledButton(
            key: const Key('login-submit'),
            onPressed: busy ? null : _login,
            child: Text(busy ? 'Đang đăng nhập...' : 'Đăng nhập'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(
              builder: (_) => ForgotPasswordPage(services: widget.services),
            )),
            child: const Text('Quên mật khẩu?'),
          ),
          const Divider(height: 32),
          OutlinedButton(
            key: const Key('go-register'),
            onPressed: () async {
              final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(
                builder: (_) => RegisterPage(services: widget.services),
              ));
              if (ok == true && context.mounted) Navigator.of(context).pop(true);
            },
            child: const Text('Chưa có tài khoản? Đăng ký'),
          ),
        ]),
      ),
    ]);
  }
}

class RegisterPage extends StatefulWidget {
  const RegisterPage({super.key, required this.services});

  final AppServices services;

  @override
  State<RegisterPage> createState() => _RegisterPageState();
}

class _RegisterPageState extends State<RegisterPage> with ServerErrors {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();

  @override
  void dispose() {
    for (final c in [_name, _email, _password, _confirm]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _register() async {
    if (!_form.currentState!.validate()) return;
    final ok = await submit(
      () => widget.services.auth.register(_email.text, _password.text, _name.text),
    );
    if (!ok || !mounted) return;
    final verified = await Navigator.of(context).push<bool>(MaterialPageRoute(
      builder: (_) => OtpPage(services: widget.services, email: _email.text.trim()),
    ));
    if (verified == true && mounted) Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    return AuthScaffold(title: 'Đăng ký', children: [
      Form(
        key: _form,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          TextFormField(
            key: const Key('register-name'),
            controller: _name,
            maxLength: 40,
            decoration: InputDecoration(labelText: 'Tên hiển thị', errorText: serverFields['displayName']),
            validator: validateDisplayName,
          ),
          TextFormField(
            key: const Key('register-email'),
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            autofillHints: const [AutofillHints.email],
            decoration: InputDecoration(labelText: 'Email', errorText: serverFields['email']),
            validator: validateEmail,
          ),
          const SizedBox(height: 12),
          TextFormField(
            key: const Key('register-password'),
            controller: _password,
            obscureText: true,
            autofillHints: const [AutofillHints.newPassword],
            decoration: InputDecoration(
              labelText: 'Mật khẩu',
              helperText: '8–72 ký tự, có chữ và số',
              errorText: serverFields['password'],
            ),
            validator: validateNewPassword,
          ),
          const SizedBox(height: 12),
          TextFormField(
            key: const Key('register-confirm'),
            controller: _confirm,
            obscureText: true,
            decoration: const InputDecoration(labelText: 'Nhập lại mật khẩu'),
            validator: (v) => v != _password.text ? 'Hai lần nhập mật khẩu không khớp' : null,
          ),
          const SizedBox(height: 16),
          messageBox(),
          FilledButton(
            key: const Key('register-submit'),
            onPressed: busy ? null : _register,
            child: Text(busy ? 'Đang gửi mã...' : 'Đăng ký'),
          ),
          const SizedBox(height: 8),
          const Text(
            'Mã xác minh 6 số sẽ được gửi từ contact@homnayangi.site. Kiểm tra cả thư mục spam.',
            textAlign: TextAlign.center,
            style: TextStyle(color: AppColors.mutedText, fontSize: 12),
          ),
        ]),
      ),
    ]);
  }
}

/// Nhập mã 6 số để xác minh email sau khi đăng ký hoặc khi đăng nhập lúc chưa xác minh.
class OtpPage extends StatefulWidget {
  const OtpPage({super.key, required this.services, required this.email});

  final AppServices services;
  final String email;

  @override
  State<OtpPage> createState() => _OtpPageState();
}

class _OtpPageState extends State<OtpPage> with ServerErrors {
  final _code = TextEditingController();
  Timer? _timer;
  int _wait = 60;

  @override
  void initState() {
    super.initState();
    _startCountdown(60);
  }

  void _startCountdown(int seconds) {
    _timer?.cancel();
    setState(() => _wait = seconds);
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) return timer.cancel();
      setState(() => _wait--);
      if (_wait <= 0) timer.cancel();
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _code.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    if (!RegExp(r'^\d{6}$').hasMatch(_code.text.trim())) {
      setState(() => serverMessage = 'Mã xác minh gồm 6 chữ số');
      return;
    }
    final ok = await submit(() => widget.services.auth.verifyEmail(widget.email, _code.text));
    if (ok && mounted) {
      showSnack(context, 'Xác minh thành công, bạn đã đăng nhập.');
      Navigator.of(context).pop(true);
    }
  }

  Future<void> _resend() async {
    try {
      final info = await widget.services.auth.resendOtp(widget.email);
      if (!mounted) return;
      showSnack(context, 'Đã gửi mã mới tới ${widget.email}.');
      _startCountdown(info.resendAfter);
    } on ApiException catch (error) {
      if (!mounted) return;
      final retry = error.details['retryAfter'];
      if (retry is num) _startCountdown(retry.toInt());
      showSnack(context, error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuthScaffold(title: 'Xác minh email', children: [
      Text('Nhập mã 6 số đã gửi tới ${widget.email}. Mã có hiệu lực 10 phút.',
          style: const TextStyle(color: AppColors.text)),
      const SizedBox(height: 16),
      TextField(
        key: const Key('otp-code'),
        controller: _code,
        keyboardType: TextInputType.number,
        maxLength: 6,
        autofillHints: const [AutofillHints.oneTimeCode],
        textAlign: TextAlign.center,
        style: const TextStyle(fontSize: 24, letterSpacing: 8),
        decoration: InputDecoration(labelText: 'Mã xác minh', errorText: serverFields['code']),
        onSubmitted: (_) => _verify(),
      ),
      messageBox(),
      FilledButton(
        key: const Key('otp-submit'),
        onPressed: busy ? null : _verify,
        child: Text(busy ? 'Đang xác minh...' : 'Xác minh'),
      ),
      TextButton(
        key: const Key('otp-resend'),
        onPressed: _wait > 0 ? null : _resend,
        child: Text(_wait > 0 ? 'Gửi lại mã sau ${_wait}s' : 'Gửi lại mã'),
      ),
    ]);
  }
}

/// Quên mật khẩu: nhập email → nhập mã + mật khẩu mới (FR-U04).
class ForgotPasswordPage extends StatefulWidget {
  const ForgotPasswordPage({super.key, required this.services});

  final AppServices services;

  @override
  State<ForgotPasswordPage> createState() => _ForgotPasswordPageState();
}

class _ForgotPasswordPageState extends State<ForgotPasswordPage> with ServerErrors {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _code = TextEditingController();
  final _password = TextEditingController();
  bool _sent = false;

  @override
  void dispose() {
    for (final c in [_email, _code, _password]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _send() async {
    if (!_form.currentState!.validate()) return;
    final ok = await submit(() => widget.services.auth.forgotPassword(_email.text));
    if (ok && mounted) setState(() => _sent = true);
  }

  Future<void> _reset() async {
    if (!_form.currentState!.validate()) return;
    final ok = await submit(
      () => widget.services.auth.resetPassword(_email.text, _code.text, _password.text),
    );
    if (ok && mounted) {
      showSnack(context, 'Đã đặt lại mật khẩu và đăng nhập.');
      Navigator.of(context).popUntil((route) => route.isFirst);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuthScaffold(title: 'Quên mật khẩu', children: [
      Form(
        key: _form,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          TextFormField(
            controller: _email,
            enabled: !_sent,
            keyboardType: TextInputType.emailAddress,
            decoration: InputDecoration(labelText: 'Email', errorText: serverFields['email']),
            validator: validateEmail,
          ),
          if (_sent) ...[
            const SizedBox(height: 8),
            const Text('Nếu email đã đăng ký, mã đặt lại đã được gửi tới hộp thư của bạn.',
                style: TextStyle(color: AppColors.mutedText)),
            const SizedBox(height: 12),
            TextFormField(
              controller: _code,
              keyboardType: TextInputType.number,
              maxLength: 6,
              decoration: InputDecoration(labelText: 'Mã 6 số', errorText: serverFields['code']),
              validator: (v) => RegExp(r'^\d{6}$').hasMatch((v ?? '').trim()) ? null : 'Mã gồm 6 chữ số',
            ),
            TextFormField(
              controller: _password,
              obscureText: true,
              decoration: InputDecoration(labelText: 'Mật khẩu mới', errorText: serverFields['newPassword']),
              validator: validateNewPassword,
            ),
          ],
          const SizedBox(height: 16),
          messageBox(),
          FilledButton(
            onPressed: busy ? null : (_sent ? _reset : _send),
            child: Text(_sent ? 'Đặt lại mật khẩu' : 'Gửi mã'),
          ),
        ]),
      ),
    ]);
  }
}