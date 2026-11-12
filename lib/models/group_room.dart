import 'json_read.dart';

/// Phòng chọn món theo nhóm (requirements-mo-rong.md P2). Trạng thái do server tính.

enum RoomPhase {
  selecting('Đang chọn món'),
  voting('Đang bỏ phiếu'),
  finished('Đã có kết quả'),
  closed('Phòng đã kết thúc');

  const RoomPhase(this.label);

  final String label;
}

enum FoodMark { pick, exclude }

class RoomMember {
  const RoomMember({required this.id, required this.displayName, this.isOwner = false, this.hasVoted = false});

  final int id;
  final String displayName;
  final bool isOwner;
  final bool hasVoted;

  static RoomMember fromJson(Map json) => RoomMember(
        id: readInt(json['id']),
        displayName: readString(json['displayName']) ?? 'Ẩn danh',
        isOwner: json['isOwner'] == true,
        hasVoted: json['hasVoted'] == true,
      );
}

/// Món trong bước chọn: số người chọn/loại và đánh dấu của chính mình.
class RoomFood {
  const RoomFood({
    required this.id,
    required this.name,
    required this.referencePrice,
    this.thumbUrl,
    this.picks = 0,
    this.excludes = 0,
    this.myMark,
    this.isCandidate = true,
  });

  final int id;
  final String name;
  final int referencePrice;
  final String? thumbUrl;
  final int picks;
  final int excludes;
  final FoodMark? myMark;
  final bool isCandidate;

  static RoomFood fromJson(Map json) => RoomFood(
        id: readInt(json['id']),
        name: '${json['name'] ?? ''}',
        referencePrice: readInt(json['referencePrice']),
        thumbUrl: readString(json['thumbUrl']),
        picks: readInt(json['picks']),
        excludes: readInt(json['excludes']),
        myMark: FoodMark.values.asNameMap()[json['myMark']],
        isCandidate: json['isCandidate'] != false,
      );
}

class RoomCandidate {
  const RoomCandidate({required this.id, required this.name, required this.referencePrice, this.votes = 0});

  final int id;
  final String name;
  final int referencePrice;
  final int votes;

  static RoomCandidate fromJson(Map json) => RoomCandidate(
        id: readInt(json['id']),
        name: '${json['name'] ?? ''}',
        referencePrice: readInt(json['referencePrice']),
        votes: readInt(json['votes']),
      );
}

class RoomResult {
  const RoomResult({required this.name, this.foodId, this.referencePrice, this.thumbUrl, this.method, this.votes});

  /// null khi món không còn công khai.
  final int? foodId;
  final String name;
  final int? referencePrice;
  final String? thumbUrl;

  /// `vote`, `spin` hoặc `tie_spin`.
  final String? method;
  final int? votes;

  String get methodLabel => switch (method) {
        'spin' => 'Quay ngẫu nhiên',
        'tie_spin' => 'Hòa phiếu ($votes phiếu), quay ngẫu nhiên trong các món hòa',
        _ => 'Bỏ phiếu (${votes ?? 0} phiếu)',
      };

  static RoomResult? fromJson(Object? json) {
    if (json is! Map) return null;
    return RoomResult(
      foodId: readIntOrNull(json['foodId']),
      name: '${json['name'] ?? ''}',
      referencePrice: readIntOrNull(json['referencePrice']),
      thumbUrl: readString(json['thumbUrl']),
      method: readString(json['method']),
      votes: readIntOrNull(json['votes']),
    );
  }
}

class RoomFilters {
  const RoomFilters({this.categorySlug, this.categoryName, this.mealPeriod, this.maxPrice});

  final String? categorySlug;
  final String? categoryName;

  /// `breakfast`, `lunch`, `dinner`, `late_night` hoặc null.
  final String? mealPeriod;
  final int? maxPrice;

  Map<String, Object?> toJson() => {
        'categorySlug': categorySlug,
        'mealPeriod': mealPeriod,
        'maxPrice': maxPrice,
      };

  static RoomFilters fromJson(Object? json) {
    final map = readMap(json);
    return RoomFilters(
      categorySlug: readString(map['categorySlug']),
      categoryName: readString(map['categoryName']),
      mealPeriod: readString(map['mealPeriod']),
      maxPrice: readIntOrNull(map['maxPrice']),
    );
  }
}

class GroupRoom {
  const GroupRoom({
    required this.id,
    required this.code,
    required this.phase,
    required this.version,
    required this.isOwner,
    required this.ownerName,
    this.filters = const RoomFilters(),
    this.members = const [],
    this.foods = const [],
    this.candidates = const [],
    this.myVote,
    this.result,
    this.closedReason,
    this.maxMembers = 10,
    this.expiresAt,
  });

  final int id;
  final String code;
  final RoomPhase phase;
  final int version;
  final bool isOwner;
  final String ownerName;
  final RoomFilters filters;
  final List<RoomMember> members;
  final List<RoomFood> foods;
  final List<RoomCandidate> candidates;
  final int? myVote;
  final RoomResult? result;
  final String? closedReason;
  final int maxMembers;
  final DateTime? expiresAt;

  bool get isActive => phase != RoomPhase.closed;

  String get closedMessage => switch (closedReason) {
        'owner_left' => 'Chủ phòng đã rời nên phòng kết thúc.',
        'owner_closed' => 'Chủ phòng đã kết thúc phòng.',
        'expired' => 'Phòng đã hết hạn.',
        'admin' => 'Phòng đã bị quản trị viên đóng.',
        _ => 'Phòng đã kết thúc.',
      };

  static GroupRoom fromJson(Map json) => GroupRoom(
        id: readInt(json['id']),
        code: '${json['code'] ?? ''}',
        phase: RoomPhase.values.asNameMap()[json['phase']] ?? RoomPhase.closed,
        version: readInt(json['version']),
        isOwner: json['isOwner'] == true,
        ownerName: readString(readMap(json['owner'])['displayName']) ?? '',
        filters: RoomFilters.fromJson(json['filters']),
        members: readMaps(json['members']).map(RoomMember.fromJson).toList(growable: false),
        foods: readMaps(json['foods']).map(RoomFood.fromJson).toList(growable: false),
        candidates: readMaps(json['candidates']).map(RoomCandidate.fromJson).toList(growable: false),
        myVote: readIntOrNull(json['myVote']),
        result: RoomResult.fromJson(json['result']),
        closedReason: readString(json['closedReason']),
        maxMembers: readInt(json['maxMembers'], 10),
        expiresAt: readDate(json['expiresAt']),
      );
}
