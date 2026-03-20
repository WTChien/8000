#!/usr/bin/env python3
"""
自動化測試腳本 - FundThePitch
模擬完整的業務流程：啟動場次、添加會場、加入評審、評審投資、查看結果
"""

import os
import sys
import json
import time
import requests
from typing import Optional, Dict
from datetime import datetime
from colorama import init, Fore, Back, Style

# 初始化 colorama
init(autoreset=True)

# 配置
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")
ADMIN_DISPLAY_NAME = os.getenv("ADMIN_DISPLAY_NAME", "管理員")

# 顏色輸出工具
class Colors:
    @staticmethod
    def header(text):
        print(f"\n{Fore.CYAN}{Back.BLACK}{'='*70}")
        print(f"{text:^70}")
        print(f"{'='*70}{Style.RESET_ALL}\n")

    @staticmethod
    def section(text):
        print(f"\n{Fore.YELLOW}>>> {text}{Style.RESET_ALL}")

    @staticmethod
    def success(text):
        print(f"{Fore.GREEN}✓ {text}{Style.RESET_ALL}")

    @staticmethod
    def error(text):
        print(f"{Fore.RED}✗ {text}{Style.RESET_ALL}")

    @staticmethod
    def info(text):
        print(f"{Fore.BLUE}ℹ {text}{Style.RESET_ALL}")

    @staticmethod
    def warning(text):
        print(f"{Fore.YELLOW}⚠ {text}{Style.RESET_ALL}")

    @staticmethod
    def json_print(data):
        print(f"{Fore.CYAN}{json.dumps(data, indent=2, ensure_ascii=False)}{Style.RESET_ALL}")


class TestAutomation:
    def __init__(self):
        self.session = requests.Session()
        self.admin_token = None
        self.admin_display_name = ADMIN_DISPLAY_NAME
        self.campaign_id = None
        self.campaign_year = datetime.now().year
        self.venue_ids = []
        self.judge_tokens = {}  # judge_identifier -> token
        self.judge_data = {}   # judge_identifier -> display_name
        self.judge_venues = {}  # judge_identifier -> venue_id
        
    def log_request(self, method: str, endpoint: str, data=None):
        """記錄 API 請求"""
        Colors.info(f"{method} {endpoint}")
        if data:
            print(f"  Payload: {json.dumps(data, ensure_ascii=False)[:100]}")

    def log_response(self, response: requests.Response, success=True):
        """記錄 API 響應"""
        status = response.status_code
        if status < 300:
            Colors.success(f"Response: {status}")
        else:
            Colors.error(f"Response: {status}")
        
        try:
            print(f"  Data: {json.dumps(response.json(), ensure_ascii=False)[:200]}")
        except:
            print(f"  Text: {response.text[:200]}")

    def check_server(self):
        """檢查後端服務器是否運行"""
        Colors.section("1️⃣  檢查後端服務器")
        try:
            response = requests.get(f"{API_BASE_URL}/docs", timeout=5)
            Colors.success(f"後端服務器運行中: {API_BASE_URL}")
            return True
        except Exception as e:
            Colors.error(f"無法連接後端服務器: {e}")
            Colors.info(f"請確保後端運行在 {API_BASE_URL}")
            return False

    def admin_login(self):
        """管理員以姓名登入"""
        Colors.section("2️⃣  Admin 登錄")
        endpoint = f"{API_BASE_URL}/api/judges/login"
        data = {
            "display_name": self.admin_display_name
        }
        
        self.log_request("POST", endpoint, data)
        
        try:
            response = self.session.post(endpoint, json=data, timeout=10)
            self.log_response(response)
            
            if response.status_code == 200:
                result = response.json()
                self.admin_token = result.get("access_token")
                user = result.get("user", {})
                if user.get("role") != "admin":
                    Colors.error(
                        f"登入者 '{self.admin_display_name}' 目前角色是 {user.get('role')}，不是 admin。"
                    )
                    Colors.info("請先確認後端已將『管理員』這個姓名授權為管理員角色。")
                    return False
                self.session.headers.update({"Authorization": f"Bearer {self.admin_token}"})
                Colors.success(f"管理員登入成功: {user.get('display_name', self.admin_display_name)}")
                return True
            else:
                Colors.error(f"Admin 登錄失敗: {response.text}")
                return False
        except Exception as e:
            Colors.error(f"請求失敗: {e}")
            return False

    def start_campaign(self, label: Optional[str] = None):
        """啟動場次"""
        Colors.section("3️⃣  啟動場次")
        endpoint = f"{API_BASE_URL}/api/admin/system/start"
        data = {
            "label": label or f"{self.campaign_year} 專題模擬投資評分"
        }
        
        self.log_request("POST", endpoint, data)
        
        try:
            response = self.session.post(endpoint, json=data, timeout=10)
            self.log_response(response)
            
            if response.status_code == 200:
                campaign = response.json()
                self.campaign_id = campaign.get("id")
                Colors.success(f"場次啟動成功")
                Colors.info(f"Campaign ID: {self.campaign_id}")
                Colors.json_print(campaign)
                return True
            else:
                Colors.error(f"場次啟動失敗: {response.text}")
                return False
        except Exception as e:
            Colors.error(f"請求失敗: {e}")
            return False

    def create_venue(self, name: str, classroom: str):
        """創建會場"""
        Colors.info(f"創建會場: {name}")
        endpoint = f"{API_BASE_URL}/api/admin/venues"
        data = {
            "name": name,
            "classroom": classroom
        }
        
        self.log_request("POST", endpoint, data)
        
        try:
            response = self.session.post(endpoint, json=data, timeout=10)
            self.log_response(response)
            
            if response.status_code == 200:
                venue = response.json()
                venue_id = venue.get("id")
                self.venue_ids.append(venue_id)
                Colors.success(f"會場 '{name}' 創建成功 (ID: {venue_id})")
                return venue_id
            else:
                Colors.error(f"會場創建失敗: {response.text}")
                return None
        except Exception as e:
            Colors.error(f"請求失敗: {e}")
            return None

    def add_venues(self):
        """添加多個會場"""
        Colors.section("4️⃣  添加會場")
        venues = [
            ("A場會場", "教室 101"),
            ("B場會場", "教室 102"),
        ]
        
        for name, classroom in venues:
            self.create_venue(name, classroom)
        
        if self.venue_ids:
            Colors.success(f"共創建 {len(self.venue_ids)} 個會場")
            return True
        else:
            Colors.warning("沒有會場被創建")
            return False

    def add_judge_member(self, display_name: str, role: str = "judge") -> Optional[str]:
        """添加評審成員"""
        Colors.info(f"添加成員: {display_name}")
        endpoint = f"{API_BASE_URL}/api/admin/members"
        data = {
            "display_name": display_name,
            "role": role
        }
        
        self.log_request("POST", endpoint, data)
        
        try:
            response = self.session.post(endpoint, json=data, timeout=10)
            self.log_response(response)
            
            if response.status_code == 200:
                result = response.json()
                member = result.get("member", {})
                identifier = member.get("identifier")
                self.judge_data[identifier] = display_name
                Colors.success(f"成員 '{display_name}' 添加成功 (ID: {identifier})")
                return identifier
            else:
                Colors.error(f"成員添加失敗: {response.text}")
                return None
        except Exception as e:
            Colors.error(f"請求失敗: {e}")
            return None

    def add_judges(self):
        """添加多個評審"""
        Colors.section("5️⃣  添加評審成員")
        judges = ["評審 A", "評審 B", "評審 C"]
        
        identifiers = []
        for judge_name in judges:
            identifier = self.add_judge_member(judge_name)
            if identifier:
                identifiers.append(identifier)
        
        if identifiers:
            Colors.success(f"共添加 {len(identifiers)} 位評審")
            return identifiers
        else:
            Colors.warning("沒有評審被添加")
            return []

    def judge_login(self, identifier: str):
        """評審以姓名登入"""
        display_name = self.judge_data.get(identifier, identifier)
        Colors.info(f"評審 '{display_name}' 登錄")
        endpoint = f"{API_BASE_URL}/api/judges/login"
        data = {
            "display_name": display_name
        }
        
        self.log_request("POST", endpoint, data)
        
        try:
            response = requests.post(endpoint, json=data, timeout=10)
            self.log_response(response)
            
            if response.status_code == 200:
                result = response.json()
                token = result.get("access_token")
                user = result.get("user", {})
                if user.get("role") != "judge":
                    Colors.warning(
                        f"登入者 '{display_name}' 角色為 {user.get('role')}，仍繼續執行，但這可能不是預期的評審帳號。"
                    )
                self.judge_tokens[identifier] = token
                Colors.success(f"評審登錄成功")
                return token
            else:
                Colors.error(f"評審登錄失敗: {response.text}")
                return None
        except Exception as e:
            Colors.error(f"請求失敗: {e}")
            return None

    def join_venue(self, identifier: str, venue_id: str):
        """評審加入會場"""
        Colors.info(f"評審加入會場")
        endpoint = f"{API_BASE_URL}/api/judges/join-venue"
        
        token = self.judge_tokens.get(identifier)
        if not token:
            Colors.error(f"尚未登錄評審 {identifier}")
            return False
        
        headers = {"Authorization": f"Bearer {token}"}
        data = {
            "venue_id": venue_id
        }
        
        self.log_request("POST", endpoint, data)
        
        try:
            response = requests.post(endpoint, json=data, headers=headers, timeout=10)
            self.log_response(response)
            
            if response.status_code in [200, 204]:
                self.judge_venues[identifier] = venue_id
                Colors.success(f"評審已加入會場")
                return True
            else:
                Colors.error(f"加入會場失敗: {response.text}")
                return False
        except Exception as e:
            Colors.error(f"請求失敗: {e}")
            return False

    def get_projects(self, venue_id: Optional[str] = None):
        """取得指定會場的專案列表"""
        endpoint = f"{API_BASE_URL}/api/projects"
        params = {"venue_id": venue_id} if venue_id else None

        response = self.session.get(endpoint, params=params, timeout=10)
        if response.status_code != 200:
            Colors.error(f"無法獲取專案列表: {response.text}")
            return None

        return response.json().get("projects", [])

    def build_distinct_investments(self, project_ids, judge_index: int, venue_index: int):
        """建立固定總額、金額彼此不同的投資分配。"""
        total_budget = 10000
        if not project_ids:
            return {}

        raw_weights = [
            ((len(project_ids) - index) * 100) + ((judge_index + 1) * 7) + ((venue_index + 1) * 3)
            for index in range(len(project_ids))
        ]
        total_weight = sum(raw_weights)

        investments = {}
        allocated = 0
        for index, project_id in enumerate(project_ids):
            if index == len(project_ids) - 1:
                amount = total_budget - allocated
            else:
                amount = round(total_budget * raw_weights[index] / total_weight)
                allocated += amount
            investments[project_id] = amount

        return investments

    def submit_investment(self, identifier: str, investments: Dict[str, float]):
        """評審提交投資"""
        Colors.info(f"評審 '{self.judge_data.get(identifier, identifier)}' 提交投資")
        endpoint = f"{API_BASE_URL}/api/submit_investment"
        
        token = self.judge_tokens.get(identifier)
        if not token:
            Colors.error(f"尚未登錄評審 {identifier}")
            return False
        
        headers = {"Authorization": f"Bearer {token}"}
        data = {"investments": investments}
        
        self.log_request("POST", endpoint, data)
        
        try:
            response = requests.post(endpoint, json=data, headers=headers, timeout=10)
            self.log_response(response)
            
            if response.status_code == 200:
                Colors.success(f"投資提交成功")
                Colors.json_print(response.json())
                return True
            else:
                Colors.error(f"投資提交失敗: {response.text}")
                return False
        except Exception as e:
            Colors.error(f"請求失敗: {e}")
            return False

    def simulate_all_judges_investment(self):
        """模擬所有評審投資"""
        Colors.section("6️⃣  評審投資模擬")

        try:
            if not self.venue_ids:
                Colors.warning("目前沒有可用會場")
                return False

            venue_project_map = {}
            for venue_index, venue_id in enumerate(self.venue_ids):
                projects = self.get_projects(venue_id)
                if not projects:
                    Colors.warning(f"會場 {venue_id} 沒有可用的專案")
                    continue
                project_ids = [project.get("id") for project in projects if project.get("id")]
                if not project_ids:
                    Colors.warning(f"會場 {venue_id} 的專案資料不完整")
                    continue
                venue_project_map[venue_id] = {
                    "project_ids": project_ids,
                    "venue_index": venue_index,
                }
                Colors.info(f"會場 {venue_id} 發現 {len(project_ids)} 個專案")

            if not venue_project_map:
                Colors.warning("沒有任何會場可供投資")
                return False

            for judge_index, identifier in enumerate(self.judge_data.keys()):
                if identifier not in self.judge_tokens:
                    if not self.judge_login(identifier):
                        Colors.warning(f"跳過評審 {identifier} 的投資")
                        continue

                venue_id = self.judge_venues.get(identifier)
                if not venue_id or venue_id not in venue_project_map:
                    Colors.warning(f"評審 {identifier} 尚未分配有效會場，跳過投資")
                    continue

                venue_info = venue_project_map[venue_id]
                investments = self.build_distinct_investments(
                    venue_info["project_ids"],
                    judge_index=judge_index,
                    venue_index=venue_info["venue_index"],
                )

                Colors.info(f"投資分配: {investments}")

                if not self.submit_investment(identifier, investments):
                    Colors.warning(f"評審 {identifier} 投資提交失敗")

                time.sleep(0.5)  # 短暫延遲

            return True
        except Exception as e:
            Colors.error(f"請求失敗: {e}")
            return False

    def get_campaign_summary(self):
        """獲取場次摘要 / 當前投資數據"""
        Colors.section("7️⃣  查看投資數據")
        endpoint = f"{API_BASE_URL}/api/projects"
        
        try:
            response = self.session.get(endpoint, timeout=10)
            if response.status_code == 200:
                data = response.json()
                Colors.success("投資數據獲取成功")
                Colors.json_print(data)
                return data
            else:
                Colors.error(f"獲取數據失敗: {response.text}")
                return None
        except Exception as e:
            Colors.error(f"請求失敗: {e}")
            return None

    def close_campaign(self):
        """關閉場次"""
        Colors.section("8️⃣  關閉場次")
        endpoint = f"{API_BASE_URL}/api/admin/system/close"
        
        self.log_request("POST", endpoint)
        
        try:
            response = self.session.post(endpoint, timeout=10)
            self.log_response(response)
            
            if response.status_code == 200:
                campaign = response.json()
                Colors.success(f"場次關閉成功")
                Colors.json_print(campaign)
                return campaign
            else:
                Colors.error(f"場次關閉失敗: {response.text}")
                return None
        except Exception as e:
            Colors.error(f"請求失敗: {e}")
            return None

    def run_full_test(self):
        """執行完整測試流程"""
        Colors.header("FundThePitch 自動化測試")
        Colors.info(f"後端 API: {API_BASE_URL}")
        Colors.info(f"年份: {self.campaign_year}")
        Colors.info(f"管理員登入姓名: {self.admin_display_name}")
        
        # 1. 檢查服務器
        if not self.check_server():
            return False
        
        # 2. Admin 登錄
        if not self.admin_login():
            return False
        
        # 3. 啟動場次
        if not self.start_campaign():
            return False
        
        # 4. 添加會場
        if not self.add_venues():
            return False
        
        # 5. 添加評審成員
        judge_identifiers = self.add_judges()
        if not judge_identifiers:
            return False
        
        # 6. 評審登錄並加入會場
        Colors.section("評審加入會場流程")
        for i, identifier in enumerate(judge_identifiers):
            if not self.judge_login(identifier):
                Colors.warning(f"評審 {identifier} 登錄失敗，跳過")
                continue

            target_venue_id = self.venue_ids[i % len(self.venue_ids)]
            if not self.join_venue(identifier, target_venue_id):
                Colors.warning(f"評審 {identifier} 加入會場失敗")
            
            time.sleep(0.5)
        
        # 7. 評審投資
        if not self.simulate_all_judges_investment():
            return False
        
        # 8. 查看投資數據
        self.get_campaign_summary()
        
        # 9. 關閉場次
        final_campaign = self.close_campaign()
        
        # 10. 顯示摘要
        Colors.header("測試完成摘要")
        Colors.success("✓ 完整業務流程測試完成")
        Colors.info(f"場次 ID: {self.campaign_id}")
        Colors.info(f"會場數量: {len(self.venue_ids)}")
        Colors.info(f"評審數量: {len(judge_identifiers)}")
        
        if final_campaign and final_campaign.get("summary"):
            Colors.info("場次摘要:")
            Colors.json_print(final_campaign["summary"])
        
        return True


def main():
    """主函數"""
    try:
        tester = TestAutomation()
        success = tester.run_full_test()
        
        if success:
            Colors.header("測試成功 ✓")
            sys.exit(0)
        else:
            Colors.header("測試失敗 ✗")
            sys.exit(1)
    except KeyboardInterrupt:
        Colors.warning("\n測試已被用戶中斷")
        sys.exit(130)
    except Exception as e:
        Colors.error(f"發生未預期的錯誤: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
