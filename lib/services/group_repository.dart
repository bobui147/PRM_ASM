import '../models/group_room.dart';
import 'api_client.dart';

/// Gọi API phòng chọn món theo nhóm (requirements-mo-rong.md P2).
/// Mọi thao tác ghi trả về trạng thái mới nhất của phòng.
class GroupRepository {
  GroupRepository(this._api);

  final ApiClient _api;

  GroupRoom _room(ApiResponse response) => GroupRoom.fromJson(response.json);

  /// Phòng đang hoạt động của mình (để vào lại sau khi mở lại app).
  Future<GroupRoom?> current() async {
    final room = (await _api.get('/rooms/current')).json['room'];
    return room is Map ? GroupRoom.fromJson(room) : null;
  }

  /// Trả null nếu [knownVersion] vẫn là bản mới nhất (polling).
  Future<GroupRoom?> state(int roomId, {int? knownVersion}) async {
    final json = (await _api.get('/rooms/$roomId', query: {'version': knownVersion})).json;
    return json['changed'] == false ? null : GroupRoom.fromJson(json);
  }

  Future<GroupRoom> create(RoomFilters filters) async => _room(await _api.post('/rooms', filters.toJson()));

  Future<GroupRoom> join(String code) async => _room(await _api.post('/rooms/join', {'code': code}));

  Future<GroupRoom> updateFilters(int roomId, RoomFilters filters) async =>
      _room(await _api.patch('/rooms/$roomId/filters', filters.toJson()));

  Future<GroupRoom> mark(int roomId, int foodId, FoodMark? mark) async =>
      _room(await _api.put('/rooms/$roomId/marks/$foodId', {'mark': mark?.name ?? 'none'}));

  /// [mode]: `vote` hoặc `spin`.
  Future<GroupRoom> start(int roomId, String mode) async =>
      _room(await _api.post('/rooms/$roomId/start', {'mode': mode}));

  Future<GroupRoom> vote(int roomId, int foodId) async =>
      _room(await _api.put('/rooms/$roomId/vote', {'foodId': foodId}));

  Future<GroupRoom> finalize(int roomId) async => _room(await _api.post('/rooms/$roomId/finalize'));

  Future<GroupRoom> backToSelecting(int roomId) async => _room(await _api.post('/rooms/$roomId/back'));

  Future<GroupRoom> close(int roomId) async => _room(await _api.post('/rooms/$roomId/close'));

  Future<void> leave(int roomId) => _api.post('/rooms/$roomId/leave');
}
